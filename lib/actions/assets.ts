"use server"

import { and, count, desc, eq, isNull, like, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  assetEvents,
  customers,
  orderLines,
  orders,
  orderUnits,
  purchaseOrders,
  purchaseOrderLines,
  requests,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { type AssetAction, type AssetStatus } from "@/lib/domain/asset-status"
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"
import { emitDomainEvent } from "@/lib/actions/domain-events"

type ActionResult = { error?: string; id?: string }

const PAGE_SIZE = 50

// ─── Asset tag generation (KARA-00001) ───────────────────────────────────────

async function nextAssetTag(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  const [row] = await tx
    .select({ tag: orderUnits.assetTag })
    .from(orderUnits)
    .where(like(orderUnits.assetTag, "KARA-%"))
    .orderBy(desc(orderUnits.assetTag))
    .limit(1)
  const lastNum = row?.tag ? parseInt(row.tag.split("-")[1] ?? "0", 10) : 0
  return `KARA-${String(lastNum + 1).padStart(5, "0")}`
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export type AssetFilters = {
  status?: AssetStatus
  search?: string
  page?: number
}

export async function getAssets(filters: AssetFilters = {}) {
  const session = await getStaffSession()
  if (!session) return { assets: [], total: 0, page: 1, pageSize: PAGE_SIZE }

  const page = Math.max(1, filters.page ?? 1)
  const conds = []
  if (filters.status) conds.push(eq(orderUnits.status, filters.status))
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conds.push(
      or(
        like(orderUnits.serialNumber, q),
        like(orderUnits.assetTag, q),
        like(orderLines.description, q),
        like(orderLines.brand, q),
        like(orderLines.model, q),
        like(purchaseOrderLines.itemDescription, q),
        like(purchaseOrderLines.brand, q),
        like(purchaseOrderLines.model, q)
      )
    )
  }
  const where = conds.length ? and(...conds) : undefined

  // An asset originates from EXACTLY ONE of a client order line OR a procurement
  // PO line (order_unit_single_origin_chk). LEFT joins on both origins + a
  // COALESCE so procurement-minted assets (orderLineId NULL) are not dropped
  // from the list/count the way an INNER JOIN on orderLineId silently did.
  const descriptionCol = sql<string>`coalesce(${orderLines.description}, ${purchaseOrderLines.itemDescription})`
  const brandCol = sql<string | null>`coalesce(${orderLines.brand}, ${purchaseOrderLines.brand})`
  const modelCol = sql<string | null>`coalesce(${orderLines.model}, ${purchaseOrderLines.model})`
  const orderNumberCol = sql<string | null>`coalesce(${orders.orderNumber}, ${purchaseOrders.poNumber})`

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orderUnits.id,
        assetTag: orderUnits.assetTag,
        serialNumber: orderUnits.serialNumber,
        status: orderUnits.status,
        location: orderUnits.location,
        purchaseCost: orderUnits.purchaseCost,
        warrantyEnd: orderUnits.warrantyEnd,
        description: descriptionCol,
        brand: brandCol,
        model: modelCol,
        orderNumber: orderNumberCol,
        supplierName: suppliers.name,
        currentCustomerName: customers.name,
        updatedAt: orderUnits.updatedAt,
      })
      .from(orderUnits)
      .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
      .leftJoin(orders, eq(orderUnits.orderId, orders.id))
      .leftJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
      .leftJoin(purchaseOrders, eq(orderUnits.purchaseOrderId, purchaseOrders.id))
      .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
      .leftJoin(customers, eq(orderUnits.currentCustomerId, customers.id))
      .where(where)
      .orderBy(desc(orderUnits.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(orderUnits)
      .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
      .leftJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
      .where(where),
  ])

  return { assets: rows, total, page, pageSize: PAGE_SIZE }
}

export async function getAssetStatusCounts() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({ status: orderUnits.status, total: count() })
    .from(orderUnits)
    .groupBy(orderUnits.status)
}

export async function getAsset(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [asset] = await db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      location: orderUnits.location,
      purchaseCost: orderUnits.purchaseCost,
      purchaseDate: orderUnits.purchaseDate,
      warrantyEnd: orderUnits.warrantyEnd,
      notes: orderUnits.notes,
      retiredAt: orderUnits.retiredAt,
      retirementReason: orderUnits.retirementReason,
      currentRequestId: orderUnits.currentRequestId,
      currentCustomerId: orderUnits.currentCustomerId,
      createdAt: orderUnits.createdAt,
      description: sql<string>`coalesce(${orderLines.description}, ${purchaseOrderLines.itemDescription})`,
      brand: sql<string | null>`coalesce(${orderLines.brand}, ${purchaseOrderLines.brand})`,
      model: sql<string | null>`coalesce(${orderLines.model}, ${purchaseOrderLines.model})`,
      orderId: orders.id,
      orderNumber: sql<string | null>`coalesce(${orders.orderNumber}, ${purchaseOrders.poNumber})`,
      supplierName: suppliers.name,
      currentCustomerName: customers.name,
    })
    .from(orderUnits)
    // LEFT joins on both origins so a procurement-minted asset (orderLineId
    // NULL) still loads — an INNER JOIN on orderLineId returned null → 404.
    .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(orders, eq(orderUnits.orderId, orders.id))
    .leftJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
    .leftJoin(purchaseOrders, eq(orderUnits.purchaseOrderId, purchaseOrders.id))
    .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
    .leftJoin(customers, eq(orderUnits.currentCustomerId, customers.id))
    .where(eq(orderUnits.id, id))

  if (!asset) return null

  let currentRequestNumber: string | null = null
  if (asset.currentRequestId) {
    const [r] = await db
      .select({ requestNumber: requests.requestNumber })
      .from(requests)
      .where(eq(requests.id, asset.currentRequestId))
    currentRequestNumber = r?.requestNumber ?? null
  }

  const events = await db
    .select()
    .from(assetEvents)
    .where(eq(assetEvents.assetId, id))
    .orderBy(desc(assetEvents.createdAt))
    .limit(200)

  return { asset, currentRequestNumber, events }
}

// ─── Event helper (usable from other actions via recordAssetEvent) ───────────

type EventInput = {
  assetId: string
  type: (typeof assetEvents.$inferInsert)["type"]
  fromStatus?: string | null
  toStatus?: string | null
  requestId?: string | null
  customerId?: string | null
  notes?: string | null
  byUserId?: string | null
}

export async function recordAssetEvent(e: EventInput) {
  try {
    await db.insert(assetEvents).values({ id: createId(), ...e })
  } catch (error) {
    // Timeline must never break the main flow (e.g. table not migrated yet).
    console.error("recordAssetEvent failed", error)
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

const transitionSchema = z.object({
  action: z.enum([
    "reserve",
    "unreserve",
    "assign",
    "unassign",
    "deliver",
    "return",
    "restock",
    "send_maintenance",
    "repair_done",
    "mark_damaged",
    "retire",
    "sell",
    "mark_lost",
    "found",
  ]),
  notes: z.string().trim().max(1000).optional(),
})

// Thin wrapper around the OI-1 chokepoint (lib/actions/asset-transition.ts)
// for the admin-triggered single-asset action button.
export async function transitionAsset(
  id: string,
  action: AssetAction,
  notes?: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = transitionSchema.safeParse({ action, notes })
  if (!parsed.success) return { error: "Invalid action" }

  try {
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, id, parsed.data.action, {
        notes: parsed.data.notes,
        byUserId: session.user.id,
      })
    })
  } catch (error) {
    if (error instanceof AssetTransitionError) return { error: error.message }
    throw error
  }

  revalidatePath("/admin/assets")
  revalidatePath(`/admin/assets/${id}`)
  return { id }
}

export async function addAssetNote(id: string, note: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const trimmed = note.trim()
  if (!trimmed || trimmed.length > 1000) return { error: "Invalid note" }

  const [unit] = await db
    .select({ id: orderUnits.id })
    .from(orderUnits)
    .where(eq(orderUnits.id, id))
  if (!unit) return { error: "Asset not found" }

  await db.insert(assetEvents).values({
    id: createId(),
    assetId: id,
    type: "note",
    notes: trimmed,
    byUserId: session.user.id,
  })
  revalidatePath(`/admin/assets/${id}`)
  return { id }
}

const detailsSchema = z.object({
  serialNumber: z.string().trim().max(120).optional(),
  purchaseDate: z.string().optional(),
  warrantyEnd: z.string().optional(),
  location: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function updateAssetDetails(
  id: string,
  data: z.infer<typeof detailsSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  const parsed = detailsSchema.safeParse(data)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  await db
    .update(orderUnits)
    .set({
      serialNumber: d.serialNumber || null,
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate).getTime() : null,
      warrantyEnd: d.warrantyEnd ? new Date(d.warrantyEnd).getTime() : null,
      location: d.location || "main_warehouse",
      notes: d.notes || null,
      updatedAt: Date.now(),
    })
    .where(eq(orderUnits.id, id))

  revalidatePath(`/admin/assets/${id}`)
  revalidatePath("/admin/assets")
  return { id }
}

// Search source order lines for the minimal-entry creation form.
export async function searchOrderLinesForAssetCreation(query: string) {
  const session = await getStaffSession()
  if (!session) return []
  const q = query.trim()
  if (!q) return []

  return db
    .select({
      orderLineId: orderLines.id,
      orderNumber: orders.orderNumber,
      description: orderLines.description,
      brand: orderLines.brand,
      model: orderLines.model,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(
      or(
        like(orders.orderNumber, `%${q}%`),
        like(orderLines.description, `%${q}%`),
        like(orderLines.brand, `%${q}%`),
        like(orderLines.model, `%${q}%`)
      )
    )
    .orderBy(desc(orderLines.createdAt))
    .limit(20)
}

// ─── Minimal asset creation (Milestone 2 / B3) ───────────────────────────────
// Not an asset transition — the asset doesn't exist yet, so applyAssetTransition
// (which requires an existing order_unit row) does not apply. This is a
// dedicated, atomic creation path: validate the source line, validate/generate
// the serial + tag, insert the row, and emit AssetCreated — all in one tx.

const createAssetSchema = z
  .object({
    orderLineId: z.string().trim().min(1).max(60).optional(),
    purchaseOrderLineId: z.string().trim().min(1).max(60).optional(),
    serialNumber: z.string().trim().min(1).max(120),
    assetTag: z.string().trim().max(40).optional(),
  })
  .refine((d) => Boolean(d.orderLineId) !== Boolean(d.purchaseOrderLineId), {
    message: "Exactly one source (order line or purchase order line) is required",
  })

// Exported separately from the session-gated wrapper below so integration
// tests can exercise the atomic creation path directly (the wrapper depends
// on next/headers via getSessionWithRole and cannot run outside a request).
// Origin is exactly one of orderLineId (client order) or purchaseOrderLineId
// (procurement, Milestone 3 / P4) — enforced here and by a DB CHECK
// constraint on order_unit (order_unit_single_origin_chk).
export async function createAssetCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof createAssetSchema>,
  actorUserId: string | null
): Promise<{ assetId: string }> {
  const d = createAssetSchema.parse(input)

  let orderLineId: string | null = null
  let orderId: string | null = null
  let purchaseOrderLineId: string | null = null
  let purchaseOrderId: string | null = null

  if (d.orderLineId) {
    const [line] = await tx
      .select({ id: orderLines.id, orderId: orderLines.orderId })
      .from(orderLines)
      .where(eq(orderLines.id, d.orderLineId))
    if (!line) throw new Error("Order line not found")
    orderLineId = line.id
    orderId = line.orderId
  } else {
    const [line] = await tx
      .select({
        id: purchaseOrderLines.id,
        purchaseOrderId: purchaseOrderLines.purchaseOrderId,
        status: purchaseOrderLines.status,
      })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.id, d.purchaseOrderLineId!))
    if (!line) throw new Error("Purchase order line not found")
    if (line.status === "cancelled")
      throw new Error("Cannot create an asset from a cancelled purchase order line")
    purchaseOrderLineId = line.id
    purchaseOrderId = line.purchaseOrderId
  }

  const [serialClash] = await tx
    .select({ id: orderUnits.id })
    .from(orderUnits)
    .where(eq(orderUnits.serialNumber, d.serialNumber))
  if (serialClash) throw new Error("Serial number already in use")

  if (d.assetTag) {
    const [clash] = await tx
      .select({ id: orderUnits.id })
      .from(orderUnits)
      .where(eq(orderUnits.assetTag, d.assetTag))
    if (clash) throw new Error("Asset tag already in use")
  }
  const assetTag = d.assetTag || (await nextAssetTag(tx))

  const assetId = createId()
  await tx.insert(orderUnits).values({
    id: assetId,
    orderLineId,
    orderId,
    purchaseOrderLineId,
    purchaseOrderId,
    serialNumber: d.serialNumber,
    assetTag,
    status: "in_stock",
  })

  await tx.insert(assetEvents).values({
    id: createId(),
    assetId,
    type: "created",
    toStatus: "in_stock",
    notes: assetTag,
    byUserId: actorUserId,
  })

  await emitDomainEvent(tx, {
    aggregateType: "asset",
    aggregateId: assetId,
    eventType: "AssetCreated",
    payload: { orderLineId, orderId, purchaseOrderLineId, purchaseOrderId, serialNumber: d.serialNumber, assetTag },
    dedupeKey: `asset:${assetId}:AssetCreated`,
    actorUserId,
  })

  return { assetId }
}

export async function createAsset(
  input: z.infer<typeof createAssetSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = createAssetSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  // PO-origin assets MUST go through the receiving flow
  // (receivePurchaseOrderLineCore), which enforces the qtyReceived < qtyOrdered
  // over-receive cap and increments the received count. This direct-entry path
  // has no such cap, so it is restricted to client-order origin only.
  if (parsed.data.purchaseOrderLineId) {
    return { error: "Assets from a purchase order must be created through the receiving flow" }
  }

  let assetId = ""
  try {
    await db.transaction(async (tx) => {
      const result = await createAssetCore(tx, parsed.data, session.user.id)
      assetId = result.assetId
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create asset" }
  }

  revalidatePath("/admin/assets")
  return { id: assetId }
}

// Back-fills KARA tags for all untagged units, oldest first. Idempotent.
export async function generateMissingAssetTags(): Promise<{ error?: string; tagged?: number }> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const untagged = await db
    .select({ id: orderUnits.id })
    .from(orderUnits)
    .where(isNull(orderUnits.assetTag))
    .orderBy(orderUnits.createdAt)

  if (untagged.length === 0) return { tagged: 0 }

  let tagged = 0
  await db.transaction(async (tx) => {
    const firstTag = await nextAssetTag(tx)
    let num = parseInt(firstTag.split("-")[1], 10)
    for (const u of untagged) {
      await tx
        .update(orderUnits)
        .set({ assetTag: `KARA-${String(num).padStart(5, "0")}`, updatedAt: Date.now() })
        .where(eq(orderUnits.id, u.id))
      await tx.insert(assetEvents).values({
        id: createId(),
        assetId: u.id,
        type: "created",
        notes: `KARA-${String(num).padStart(5, "0")}`,
        byUserId: session.user.id,
      })
      num += 1
      tagged += 1
    }
  })

  revalidatePath("/admin/assets")
  return { tagged }
}
