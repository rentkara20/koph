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
import { assetBrandSql, assetDisplayNameSql, assetModelSql } from "@/lib/db/asset-name"
import { createId } from "@/lib/utils/ids"
import { parseRiyadhDate } from "@/lib/utils/format"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { assetKindForOrderLineType, type AssetAction, type AssetStatus } from "@/lib/domain/asset-status"
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
  // Which inventory this view manages. The Assets page is rental-only; the
  // Products-for-sale page passes "sale". Defaults to rental so every existing
  // caller keeps its historical (rental) behavior.
  kind?: "rental" | "sale"
  // Ownership facet. Unset means "every ownership" — the Assets page must be
  // able to FIND a customer's device, so this list deliberately does not
  // exclude non-KARA units the way the fleet reports do. It is a filter the
  // operator chooses, not a hidden exclusion.
  ownership?: "kara" | "customer" | "supplier"
}

export async function getAssets(filters: AssetFilters = {}) {
  const session = await getStaffSession()
  if (!session) return { assets: [], total: 0, page: 1, pageSize: PAGE_SIZE }

  const page = Math.max(1, filters.page ?? 1)
  const conds = []
  conds.push(eq(orderUnits.kind, filters.kind ?? "rental"))
  if (filters.ownership) conds.push(eq(orderUnits.ownership, filters.ownership))
  if (filters.status) conds.push(eq(orderUnits.status, filters.status))
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conds.push(
      or(
        like(orderUnits.serialNumber, q),
        like(orderUnits.assetTag, q),
        like(orderUnits.brand, q),
        like(orderUnits.model, q),
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
  const descriptionCol = assetDisplayNameSql(orderLines.description, purchaseOrderLines.itemDescription)
  const brandCol = assetBrandSql(orderLines.brand, purchaseOrderLines.brand)
  const modelCol = assetModelSql(orderLines.model, purchaseOrderLines.model)
  const orderNumberCol = sql<string | null>`coalesce(${orders.orderNumber}, ${purchaseOrders.poNumber})`

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orderUnits.id,
        assetTag: orderUnits.assetTag,
        serialNumber: orderUnits.serialNumber,
        status: orderUnits.status,
        ownership: orderUnits.ownership,
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
      .leftJoin(suppliers, or(eq(orderUnits.supplierId, suppliers.id), eq(purchaseOrders.supplierId, suppliers.id)))
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

export async function getAssetStatusCounts(
  kind: "rental" | "sale" = "rental",
  ownership?: "kara" | "customer" | "supplier"
) {
  const session = await getStaffSession()
  if (!session) return []
  // The chips must agree with the list they sit above, so they take the same
  // ownership facet — an unfiltered count over a filtered list reads as a bug.
  const conds = [eq(orderUnits.kind, kind)]
  if (ownership) conds.push(eq(orderUnits.ownership, ownership))
  return db
    .select({ status: orderUnits.status, total: count() })
    .from(orderUnits)
    .where(and(...conds))
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
      // kind and ownership both gate which lifecycle actions are legal; the
      // detail page renders its buttons from them, so selecting them here is
      // what keeps the UI from offering an action the server will reject.
      kind: orderUnits.kind,
      ownership: orderUnits.ownership,
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
      description: assetDisplayNameSql(orderLines.description, purchaseOrderLines.itemDescription),
      brand: assetBrandSql(orderLines.brand, purchaseOrderLines.brand),
      model: assetModelSql(orderLines.model, purchaseOrderLines.model),
      // The un-overridden origin-line text, so the rename form can show what it
      // is masking and offer a revert.
      sourceName: sql<string | null>`coalesce(${orderLines.description}, ${purchaseOrderLines.itemDescription})`,
      nameOverride: orderUnits.model,
      orderId: orders.id,
      purchaseOrderId: purchaseOrders.id,
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
    .leftJoin(suppliers, or(eq(orderUnits.supplierId, suppliers.id), eq(purchaseOrders.supplierId, suppliers.id)))
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

// ─── Device name (per-asset override of the origin line's description) ───────
// Writes order_unit.model — the per-asset device descriptor. An empty name
// clears the override so the asset falls back to its order/PO line text again.
// Not a lifecycle transition, so it does not go through applyAssetTransition;
// logged as a "correction" event to keep the rename auditable in the timeline.

export async function renameAssetCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  id: string,
  deviceName: string | null,
  actorUserId: string | null
): Promise<{ assetId: string; previous: string | null }> {
  const [unit] = await tx
    .select({ id: orderUnits.id, model: orderUnits.model })
    .from(orderUnits)
    .where(eq(orderUnits.id, id))
  if (!unit) throw new Error("Asset not found")

  const previous = unit.model
  if (previous === deviceName) return { assetId: id, previous }

  await tx
    .update(orderUnits)
    .set({ model: deviceName, updatedAt: Date.now() })
    .where(eq(orderUnits.id, id))

  await tx.insert(assetEvents).values({
    id: createId(),
    assetId: id,
    type: "correction",
    notes: `${previous ?? "—"} → ${deviceName ?? "—"}`,
    byUserId: actorUserId,
  })

  return { assetId: id, previous }
}

const renameSchema = z.object({ deviceName: z.string().trim().max(200) })

export async function renameAsset(id: string, deviceName: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  const parsed = renameSchema.safeParse({ deviceName })
  if (!parsed.success) return { error: "Invalid input" }

  try {
    await db.transaction(async (tx) => {
      await renameAssetCore(tx, id, parsed.data.deviceName || null, session.user.id)
    })
  } catch (error) {
    if (error instanceof Error && error.message === "Asset not found") return { error: error.message }
    throw error
  }

  revalidatePath(`/admin/assets/${id}`)
  revalidatePath("/admin/assets")
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
      purchaseDate: parseRiyadhDate(d.purchaseDate),
      warrantyEnd: parseRiyadhDate(d.warrantyEnd),
      location: d.location || "main_warehouse",
      notes: d.notes || null,
      updatedAt: Date.now(),
    })
    .where(eq(orderUnits.id, id))

  revalidatePath(`/admin/assets/${id}`)
  revalidatePath("/admin/assets")
  return { id }
}

// CSV Import/Export Center: tx-scoped update for an existing asset matched by
// assetTag. Mirrors updateAssetDetails's non-lifecycle fields only — status is
// intentionally NOT settable here. Asset status is a chokepoint-guarded state
// machine (see applyAssetTransition / OI-1); letting a CSV row jump status
// directly would bypass asset_event history and the current-request/customer
// linkage invariants. Callers must validate `status` against the current row
// and error out before calling this if the CSV requests a status change.
export async function updateAssetImportCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  id: string,
  input: {
    serialNumber?: string
    location?: string
    purchaseCost?: number
    purchaseDate?: number
    warrantyEnd?: number
    notes?: string
    brand?: string
    model?: string
    deviceType?: string
    partNumber?: string
    warrantyCost?: number
    invoiceNo?: string
    sourceOrderNo?: string
  }
): Promise<{ assetId: string }> {
  await tx
    .update(orderUnits)
    .set({
      serialNumber: input.serialNumber || null,
      location: input.location || "main_warehouse",
      purchaseCost: input.purchaseCost ?? null,
      purchaseDate: input.purchaseDate ?? null,
      warrantyEnd: input.warrantyEnd ?? null,
      notes: input.notes || null,
      brand: input.brand || null,
      model: input.model || null,
      deviceType: input.deviceType || null,
      partNumber: input.partNumber || null,
      warrantyCost: input.warrantyCost ?? null,
      invoiceNo: input.invoiceNo || null,
      sourceOrderNo: input.sourceOrderNo || null,
      updatedAt: Date.now(),
    })
    .where(eq(orderUnits.id, id))
  return { assetId: id }
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

// A unit is origin-less when the caller says so (CSV back-fill) or when it
// simply cannot have one: a device we do not own has no order line of ours and
// was never bought on our PO. Both the origin rule and createAssetCore read
// this one predicate so they cannot disagree.
function hasNoOrigin(d: { standalone?: boolean; ownership?: "kara" | "customer" | "supplier" }): boolean {
  return d.standalone === true || (d.ownership !== undefined && d.ownership !== "kara")
}

const createAssetSchema = z
  .object({
    orderLineId: z.string().trim().min(1).max(60).optional(),
    purchaseOrderLineId: z.string().trim().min(1).max(60).optional(),
    serialNumber: z.string().trim().min(1).max(120).optional(),
    assetTag: z.string().trim().max(40).optional(),
    supplierId: z.string().trim().max(60).optional(),
    purchaseCost: z.number().min(0).max(100_000_000).optional(),
    notes: z.string().trim().max(1000).optional(),
    // CSV Import/Export Center only: a standalone asset has no client-order or
    // PO origin at all (e.g. a legacy device being back-filled into the
    // system). Every existing caller omits this (defaults false), so the
    // original "exactly one origin" rule is unchanged for them.
    standalone: z.boolean().optional(),
    // Optional extra fields the CSV importer may supply; every existing
    // caller omits these, so behavior for them is unchanged.
    location: z.string().trim().max(120).optional(),
    purchaseDate: z.number().optional(),
    warrantyEnd: z.number().optional(),
    // Device identity + cost/procurement references carried on the asset
    // itself (see order_unit schema). Every existing caller omits these.
    brand: z.string().trim().max(120).optional(),
    model: z.string().trim().max(200).optional(),
    deviceType: z.string().trim().max(120).optional(),
    partNumber: z.string().trim().max(120).optional(),
    warrantyCost: z.number().min(0).max(100_000_000).optional(),
    invoiceNo: z.string().trim().max(120).optional(),
    sourceOrderNo: z.string().trim().max(120).optional(),
    // Who owns the physical device. Defaults to "kara" so every existing
    // caller is unchanged. A non-KARA device may only be entered standalone:
    // an order line is one of OUR rental/sale lines and a PO line means we
    // bought the device, so either origin already asserts KARA ownership.
    ownership: z.enum(["kara", "customer", "supplier"]).optional(),
  })
  .refine(
    (d) => (hasNoOrigin(d) ? !d.orderLineId && !d.purchaseOrderLineId : Boolean(d.orderLineId) !== Boolean(d.purchaseOrderLineId)),
    {
      message: "Exactly one source (order line or purchase order line) is required",
    }
  )
  .refine((d) => hasNoOrigin(d) || !d.ownership || d.ownership === "kara", {
    message: "A device not owned by KARA cannot be created from an order line or a purchase order line",
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
  actorUserId: string | null,
  // Receiving-QC gate: a PO with qcRequired mints at "receiving_qc" so the
  // unit is not available inventory until an explicit qc_pass. Only the
  // receiving flow sets this — direct entry always mints at in_stock.
  initialStatus: "in_stock" | "receiving_qc" = "in_stock",
  // Ownership/return semantics of the minted unit. Rental (default) enters the
  // rental pool and must return; sale is a serialized product-for-sale that
  // ends as sold. The receiving flow passes the PO line's kind.
  kind: "rental" | "sale" = "rental"
): Promise<{ assetId: string }> {
  const d = createAssetSchema.parse(input)
  const serialNumber = d.serialNumber ? d.serialNumber.toUpperCase() : null

  let orderLineId: string | null = null
  let orderId: string | null = null
  let purchaseOrderLineId: string | null = null
  let purchaseOrderId: string | null = null
  // Effective kind. For a PO origin the caller passes the PO line's kind. For
  // an order-line origin we DERIVE it from the line's own type so a direct
  // asset created from a sold_product line lands in products-for-sale, never
  // the rental pool — the order line's type is authoritative here.
  let effectiveKind: "rental" | "sale" = kind
  const ownership = d.ownership ?? "kara"

  if (hasNoOrigin(d)) {
    // No origin at all — the CSV importer back-filling a pre-existing device,
    // or any device we do not own.
  } else if (d.orderLineId) {
    const [line] = await tx
      .select({ id: orderLines.id, orderId: orderLines.orderId, type: orderLines.type })
      .from(orderLines)
      .where(eq(orderLines.id, d.orderLineId))
    if (!line) throw new Error("Order line not found")
    orderLineId = line.id
    orderId = line.orderId
    effectiveKind = assetKindForOrderLineType(line.type)
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

  if (serialNumber) {
    const [serialClash] = await tx
      .select({ id: orderUnits.id })
      .from(orderUnits)
      .where(sql`lower(trim(${orderUnits.serialNumber})) = lower(${serialNumber})`)
    if (serialClash) throw new Error("Serial number already in use")
  }

  if (d.assetTag) {
    const [clash] = await tx
      .select({ id: orderUnits.id })
      .from(orderUnits)
      .where(eq(orderUnits.assetTag, d.assetTag))
    if (clash) throw new Error("Asset tag already in use")
  }
  // Only KARA devices get a KARA-#### asset tag. Minting one for a customer's
  // own device would stamp our inventory identity on property we do not own
  // and pull it into every tag-driven report.
  const assetTag = d.assetTag || (ownership === "kara" ? await nextAssetTag(tx) : null)

  const assetId = createId()
  await tx.insert(orderUnits).values({
    id: assetId,
    orderLineId,
    orderId,
    purchaseOrderLineId,
    purchaseOrderId,
    serialNumber,
    supplierId: d.supplierId || null,
    purchaseCost: d.purchaseCost ?? null,
    notes: d.notes || null,
    assetTag,
    status: initialStatus,
    kind: effectiveKind,
    ownership,
    location: d.location || "main_warehouse",
    purchaseDate: d.purchaseDate ?? null,
    warrantyEnd: d.warrantyEnd ?? null,
    brand: d.brand || null,
    model: d.model || null,
    deviceType: d.deviceType || null,
    partNumber: d.partNumber || null,
    warrantyCost: d.warrantyCost ?? null,
    invoiceNo: d.invoiceNo || null,
    sourceOrderNo: d.sourceOrderNo || null,
  })

  await tx.insert(assetEvents).values({
    id: createId(),
    assetId,
    type: "created",
    toStatus: initialStatus,
    notes: assetTag,
    byUserId: actorUserId,
  })

  await emitDomainEvent(tx, {
    aggregateType: "asset",
    aggregateId: assetId,
    eventType: "AssetCreated",
    payload: { orderLineId, orderId, purchaseOrderLineId, purchaseOrderId, serialNumber, assetTag, kind: effectiveKind, ownership },
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
    // KARA-owned only: a customer's or supplier's device is deliberately left
    // untagged (createAssetCore never mints one), and a back-fill sweep must
    // not undo that.
    .where(and(isNull(orderUnits.assetTag), eq(orderUnits.ownership, "kara")))
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
