"use server"

import { and, desc, eq, notInArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { orderUnits, purchaseOrders, supplierReturns } from "@/lib/db/schema"
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"
import { createAssetCore } from "@/lib/actions/assets"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { supplierReturnStatusAfter, type SupplierReturnResolution } from "@/lib/domain/supplier-return"
import { createId } from "@/lib/utils/ids"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type ActionResult = { error?: string; id?: string }

export async function createSupplierReturnCore(
  tx: Tx,
  input: { assetId: string; resolution: SupplierReturnResolution; reason: string },
  actorUserId: string | null
): Promise<{ id: string }> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("Supplier return reason is required")
  if (reason.length > 500) throw new Error("Supplier return reason is too long")

  const [asset] = await tx
    .select({
      id: orderUnits.id,
      status: orderUnits.status,
      purchaseOrderId: orderUnits.purchaseOrderId,
      supplierId: orderUnits.supplierId,
    })
    .from(orderUnits)
    .where(eq(orderUnits.id, input.assetId))
  if (!asset) throw new Error("Asset not found")
  if (asset.status !== "damaged") throw new Error("Only a rejected device can be returned to its supplier")
  if (!asset.purchaseOrderId) throw new Error("This device is not linked to a supplier purchase order")
  const [purchaseOrder] = await tx
    .select({ supplierId: purchaseOrders.supplierId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, asset.purchaseOrderId))
  const supplierId = asset.supplierId ?? purchaseOrder?.supplierId
  if (!supplierId) throw new Error("This device is not linked to a supplier purchase order")

  const [openReturn] = await tx
    .select({ id: supplierReturns.id })
    .from(supplierReturns)
    .where(and(
      eq(supplierReturns.assetId, asset.id),
      notInArray(supplierReturns.status, ["resolved", "cancelled", "replacement_received"])
    ))
  if (openReturn) throw new Error("This device already has an open supplier return")

  const id = createId()
  await tx.insert(supplierReturns).values({
    id,
    assetId: asset.id,
    purchaseOrderId: asset.purchaseOrderId,
    supplierId,
    resolution: input.resolution,
    reason,
    createdBy: actorUserId,
  })
  await applyAssetTransition(tx, asset.id, "start_supplier_return", {
    notes: reason,
    byUserId: actorUserId,
  })
  return { id }
}

export async function confirmSupplierReturnCore(
  tx: Tx,
  supplierReturnId: string,
  rmaReference: string | null,
  actorUserId: string | null
): Promise<void> {
  const [record] = await tx.select().from(supplierReturns).where(eq(supplierReturns.id, supplierReturnId))
  if (!record) throw new Error("Supplier return not found")
  const nextStatus = supplierReturnStatusAfter(record.status, "confirm_returned", record.resolution)

  await applyAssetTransition(tx, record.assetId, "confirm_supplier_return", {
    notes: ["Returned to supplier", rmaReference?.trim()].filter(Boolean).join(" · "),
    location: "supplier",
    byUserId: actorUserId,
  })
  await tx
    .update(supplierReturns)
    .set({
      status: nextStatus,
      rmaReference: rmaReference?.trim() || null,
      returnedAt: Date.now(),
      resolvedAt: nextStatus === "resolved" ? Date.now() : null,
      updatedAt: Date.now(),
    })
    .where(eq(supplierReturns.id, record.id))
}

export async function receiveSupplierReplacementCore(
  tx: Tx,
  supplierReturnId: string,
  serialNumber: string,
  actorUserId: string | null
): Promise<{ assetId: string }> {
  const serial = serialNumber.trim()
  if (!serial) throw new Error("Replacement serial number is required")

  const [record] = await tx.select().from(supplierReturns).where(eq(supplierReturns.id, supplierReturnId))
  if (!record) throw new Error("Supplier return not found")
  const nextStatus = supplierReturnStatusAfter(record.status, "receive_replacement", record.resolution)
  const [oldAsset] = await tx.select().from(orderUnits).where(eq(orderUnits.id, record.assetId))
  if (!oldAsset?.purchaseOrderLineId) throw new Error("Original purchase order line not found")
  const [po] = await tx
    .select({ qcRequired: purchaseOrders.qcRequired })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, record.purchaseOrderId))
  if (!po) throw new Error("Purchase order not found")

  const replacement = await createAssetCore(tx, {
    purchaseOrderLineId: oldAsset.purchaseOrderLineId,
    serialNumber: serial,
    supplierId: record.supplierId,
    purchaseCost: oldAsset.purchaseCost ?? undefined,
    notes: `Replacement for ${oldAsset.assetTag ?? oldAsset.serialNumber ?? oldAsset.id}`,
  }, actorUserId, po.qcRequired ? "receiving_qc" : "in_stock")

  await tx
    .update(supplierReturns)
    .set({
      status: nextStatus,
      replacementAssetId: replacement.assetId,
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(supplierReturns.id, record.id))
  return replacement
}

export async function getSupplierReturnForAsset(assetId: string) {
  const session = await getStaffSession()
  if (!session) return null
  const [record] = await db
    .select()
    .from(supplierReturns)
    .where(eq(supplierReturns.assetId, assetId))
    .orderBy(desc(supplierReturns.createdAt))
    .limit(1)
  return record ?? null
}

export async function getSupplierReturnsForPurchaseOrder(purchaseOrderId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select()
    .from(supplierReturns)
    .where(eq(supplierReturns.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(supplierReturns.createdAt))
}

function revalidateSupplierReturn(assetId: string, purchaseOrderId?: string | null) {
  revalidatePath(`/admin/assets/${assetId}`)
  revalidatePath("/admin/assets")
  revalidatePath("/admin/procurement")
  if (purchaseOrderId) revalidatePath(`/admin/procurement/${purchaseOrderId}`)
}

export async function createSupplierReturn(input: {
  assetId: string
  resolution: SupplierReturnResolution
  reason: string
}): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  try {
    const result = await db.transaction((tx) => createSupplierReturnCore(tx, input, session.user.id))
    revalidateSupplierReturn(input.assetId)
    return result
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    return { error: error instanceof Error ? error.message : "Failed to create supplier return" }
  }
}

export async function confirmSupplierReturn(supplierReturnId: string, rmaReference?: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  try {
    const [record] = await db.select().from(supplierReturns).where(eq(supplierReturns.id, supplierReturnId))
    if (!record) return { error: "Supplier return not found" }
    await db.transaction((tx) => confirmSupplierReturnCore(tx, supplierReturnId, rmaReference ?? null, session.user.id))
    revalidateSupplierReturn(record.assetId, record.purchaseOrderId)
    return { id: supplierReturnId }
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    return { error: error instanceof Error ? error.message : "Failed to confirm supplier return" }
  }
}

export async function receiveSupplierReplacement(supplierReturnId: string, serialNumber: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  try {
    const [record] = await db.select().from(supplierReturns).where(eq(supplierReturns.id, supplierReturnId))
    if (!record) return { error: "Supplier return not found" }
    const result = await db.transaction((tx) =>
      receiveSupplierReplacementCore(tx, supplierReturnId, serialNumber, session.user.id)
    )
    revalidateSupplierReturn(record.assetId, record.purchaseOrderId)
    return { id: result.assetId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to receive supplier replacement" }
  }
}
