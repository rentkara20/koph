"use server"

// Procurement (Milestone 3 / P4). Purchase orders/lines are a distinct layer
// from the client "order"/"order_line" tables — receiving a line creates an
// Asset via the same createAssetCore chokepoint used by the existing
// minimal-entry flow (lib/actions/assets.ts), just with a purchaseOrderLineId
// origin instead of orderLineId. Existing client order-line asset creation
// stays untouched and fully compatible.
import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { orderUnits, purchaseOrderLines, purchaseOrders, suppliers } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { createAssetCore } from "@/lib/actions/assets"
import { emitDomainEvent } from "@/lib/actions/domain-events"

type ActionResult = { error?: string; id?: string }

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPurchaseOrders() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      supplierName: suppliers.name,
      invoiceRef: purchaseOrders.invoiceRef,
      orderedAt: purchaseOrders.orderedAt,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(200)
}

export async function getPurchaseOrder(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      invoiceRef: purchaseOrders.invoiceRef,
      orderedAt: purchaseOrders.orderedAt,
      notes: purchaseOrders.notes,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, id))
  if (!po) return null

  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, id))
    .orderBy(purchaseOrderLines.createdAt)

  return { po, lines }
}

// Assets received against a specific PO line — for the receiving UI list.
export async function getReceivedUnitsForLine(purchaseOrderLineId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      createdAt: orderUnits.createdAt,
    })
    .from(orderUnits)
    .where(eq(orderUnits.purchaseOrderLineId, purchaseOrderLineId))
    .orderBy(desc(orderUnits.createdAt))
}

// ─── Create purchase order ───────────────────────────────────────────────────

const createPoSchema = z.object({
  supplierId: z.string().trim().min(1),
  poNumber: z.string().trim().min(1).max(60),
  invoiceRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        itemDescription: z.string().trim().min(1).max(300),
        brand: z.string().trim().max(120).optional(),
        model: z.string().trim().max(120).optional(),
        requiresSerial: z.boolean().default(true),
        qtyOrdered: z.number().int().min(1),
        unitCost: z.number().min(0).optional(),
      })
    )
    .min(1),
})

export async function createPurchaseOrder(
  input: z.infer<typeof createPoSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = createPoSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const [clash] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.poNumber, d.poNumber))
  if (clash) return { error: "PO number already exists" }

  let poId = ""
  await db.transaction(async (tx) => {
    poId = createId()
    await tx.insert(purchaseOrders).values({
      id: poId,
      supplierId: d.supplierId,
      poNumber: d.poNumber,
      status: "ordered",
      invoiceRef: d.invoiceRef,
      orderedAt: Date.now(),
      notes: d.notes,
      createdBy: session.user.id,
    })
    for (const line of d.lines) {
      await tx.insert(purchaseOrderLines).values({
        id: createId(),
        purchaseOrderId: poId,
        itemDescription: line.itemDescription,
        brand: line.brand,
        model: line.model,
        requiresSerial: line.requiresSerial,
        qtyOrdered: line.qtyOrdered,
        unitCost: line.unitCost,
      })
    }
    await emitDomainEvent(tx, {
      aggregateType: "purchase_order",
      aggregateId: poId,
      eventType: "PurchaseOrderCreated",
      payload: { poNumber: d.poNumber, supplierId: d.supplierId, lineCount: d.lines.length },
      dedupeKey: `purchase_order:${poId}:PurchaseOrderCreated`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath("/admin/procurement")
  return { id: poId }
}

// ─── Receive a line into an Asset (atomic) ───────────────────────────────────
// Not a status transition on an existing asset — same rationale as
// createAssetCore in lib/actions/assets.ts. Validates remaining quantity,
// creates the Asset via createAssetCore with a purchaseOrderLineId origin,
// increments qtyReceived, and recomputes the PO's aggregate status — all in
// one transaction.

const receiveLineSchema = z.object({
  purchaseOrderLineId: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1).max(120),
  assetTag: z.string().trim().max(40).optional(),
})

// Exported separately so integration tests can exercise the atomic receiving
// path directly, same rationale as createAssetCore (lib/actions/assets.ts).
export async function receivePurchaseOrderLineCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof receiveLineSchema>,
  actorUserId: string | null
): Promise<{ assetId: string }> {
  const d = receiveLineSchema.parse(input)

  const [line] = await tx
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.id, d.purchaseOrderLineId))
  if (!line) throw new Error("Purchase order line not found")
  if (line.qtyReceived >= line.qtyOrdered) {
    throw new Error("Cannot receive more than ordered")
  }

  const result = await createAssetCore(
    tx,
    { purchaseOrderLineId: line.id, serialNumber: d.serialNumber, assetTag: d.assetTag },
    actorUserId
  )
  const assetId = result.assetId

  const newQtyReceived = line.qtyReceived + 1
  await tx
    .update(purchaseOrderLines)
    .set({ qtyReceived: newQtyReceived, updatedAt: Date.now() })
    .where(eq(purchaseOrderLines.id, line.id))

  await emitDomainEvent(tx, {
    aggregateType: "purchase_order",
    aggregateId: line.purchaseOrderId,
    eventType: "PurchaseOrderLineReceived",
    payload: { purchaseOrderLineId: line.id, assetId, qtyReceived: newQtyReceived },
    dedupeKey: `purchase_order_line:${line.id}:received:${assetId}`,
    actorUserId,
  })

  const allLines = await tx
    .select({
      id: purchaseOrderLines.id,
      qtyOrdered: purchaseOrderLines.qtyOrdered,
      qtyReceived: purchaseOrderLines.qtyReceived,
    })
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, line.purchaseOrderId))
  const totalOrdered = allLines.reduce((s, l) => s + l.qtyOrdered, 0)
  const totalReceived = allLines.reduce((s, l) => s + (l.id === line.id ? newQtyReceived : l.qtyReceived), 0)
  const newStatus =
    totalReceived >= totalOrdered ? "received" : totalReceived > 0 ? "partially_received" : "ordered"
  await tx
    .update(purchaseOrders)
    .set({ status: newStatus, updatedAt: Date.now() })
    .where(eq(purchaseOrders.id, line.purchaseOrderId))

  return { assetId }
}

export async function receivePurchaseOrderLine(
  input: z.infer<typeof receiveLineSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = receiveLineSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let assetId = ""
  try {
    await db.transaction(async (tx) => {
      const result = await receivePurchaseOrderLineCore(tx, parsed.data, session.user.id)
      assetId = result.assetId
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to receive line" }
  }

  revalidatePath("/admin/procurement")
  revalidatePath("/admin/assets")
  return { id: assetId }
}
