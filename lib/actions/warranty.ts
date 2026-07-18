"use server"

// Warranty (Milestone 3 / P5). Separate module from Asset fields — a
// warranty is purchased (with a device, separately, from another supplier,
// or in bulk) as a warranty_batch, then assigned to an Asset as a
// warranty_assignment with its own activation lifecycle. Not an asset
// transition: assigning/activating warranty never touches order_unit.status.
import { and, desc, eq, gt, lt, lte, notInArray, sql } from "drizzle-orm"
import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  attachments,
  orderUnits,
  purchaseOrders,
  suppliers,
  warrantyAssignments,
  warrantyBatches,
  warrantyProducts,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { getWarrantyExpiryAlertDays } from "@/lib/actions/settings"

type ActionResult = { error?: string; id?: string }
const DAY_MS = 24 * 60 * 60 * 1000

// Lazily flips active assignments past their endAt to "expired" so the
// status column stays truthful — nothing else transitions this state.
// Called before any read/write that depends on status reflecting reality.
async function expireStaleWarranties(): Promise<void> {
  await db
    .update(warrantyAssignments)
    .set({ status: "expired", updatedAt: Date.now() })
    .where(and(eq(warrantyAssignments.status, "active"), lte(warrantyAssignments.endAt, Date.now())))
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function getWarrantyProducts() {
  const session = await getStaffSession()
  if (!session) return []
  return db.select().from(warrantyProducts).orderBy(desc(warrantyProducts.createdAt))
}

export async function getActiveWarrantyProducts() {
  return db.select().from(warrantyProducts).where(eq(warrantyProducts.isActive, true))
}

const createProductSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  durationMonths: z.number().int().min(1).max(120),
  providerName: z.string().trim().max(200).optional(),
})

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Tx-scoped create, reused by the "use server" wrapper below AND the CSV
// Import/Export Center. Throws on invalid input (mirrors createCustomerCore's
// throw-in-Core / catch-in-wrapper convention). CSV import for this module
// stays create-only (see lib/import-export/warranty-product.ts) — only the
// admin settings UI can edit/disable an existing product.
export async function createWarrantyProductCore(
  tx: Tx,
  input: z.infer<typeof createProductSchema>,
  _actorUserId: string | null
): Promise<{ id: string }> {
  const parsed = createProductSchema.parse(input)
  const id = createId()
  await tx.insert(warrantyProducts).values({ id, ...parsed })
  return { id }
}

export async function createWarrantyProduct(
  input: z.infer<typeof createProductSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = createProductSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let id = ""
  await db.transaction(async (tx) => {
    const result = await createWarrantyProductCore(tx, parsed.data, session.user.id)
    id = result.id
  })
  revalidatePath("/admin/warranty")
  revalidatePath("/admin/settings/warranty")
  return { id }
}

const updateProductSchema = z.object({
  nameAr: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().min(1).max(200).optional(),
  durationMonths: z.number().int().min(1).max(120).optional(),
})

export async function updateWarrantyProduct(
  id: string,
  input: z.infer<typeof updateProductSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = updateProductSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  await db.update(warrantyProducts).set(parsed.data).where(eq(warrantyProducts.id, id))

  revalidatePath("/admin/warranty")
  revalidatePath("/admin/settings/warranty")
  return { id }
}

export async function toggleWarrantyProduct(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [product] = await db.select().from(warrantyProducts).where(eq(warrantyProducts.id, id))
  if (!product) return { error: "Not found" }

  await db
    .update(warrantyProducts)
    .set({ isActive: !product.isActive })
    .where(eq(warrantyProducts.id, id))

  revalidatePath("/admin/warranty")
  revalidatePath("/admin/settings/warranty")
  return { id }
}

// ─── Batches (purchased warranty coverage) ───────────────────────────────────

export async function getWarrantyBatches() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: warrantyBatches.id,
      source: warrantyBatches.source,
      invoiceRef: warrantyBatches.invoiceRef,
      unitsCovered: warrantyBatches.unitsCovered,
      unitsAssigned: warrantyBatches.unitsAssigned,
      productNameEn: warrantyProducts.nameEn,
      productNameAr: warrantyProducts.nameAr,
      durationMonths: warrantyProducts.durationMonths,
    })
    .from(warrantyBatches)
    .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))
    .orderBy(desc(warrantyBatches.createdAt))
}

const createBatchSchema = z.object({
  warrantyProductId: z.string().trim().min(1),
  source: z.enum(["with_device", "separate", "other_supplier", "bulk"]),
  purchaseOrderId: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().min(1).optional(),
  invoiceRef: z.string().trim().max(120).optional(),
  unitsCovered: z.number().int().min(1).max(10000),
})

// Auto-inherits invoiceRef and supplier from the linked purchase order when
// the caller doesn't supply one — avoids duplicate data entry for
// "with_device" batches. For "separate"/"other_supplier" batches, the caller
// supplies supplierId directly (the warranty provider often isn't the device
// supplier at all).
//
// Tx-scoped create, reused by the "use server" wrapper below AND the CSV
// Import/Export Center. Batches are create-only via CSV — unitsAssigned is
// system-incremented only by assignWarrantyCore and must never be set here.
export async function createWarrantyBatchCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof createBatchSchema>,
  _actorUserId: string | null
): Promise<{ id: string }> {
  const d = createBatchSchema.parse(input)

  let invoiceRef = d.invoiceRef
  let supplierId = d.supplierId
  if ((!invoiceRef || !supplierId) && d.purchaseOrderId) {
    const [po] = await tx
      .select({ invoiceRef: purchaseOrders.invoiceRef, supplierId: purchaseOrders.supplierId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, d.purchaseOrderId))
    invoiceRef = invoiceRef ?? po?.invoiceRef ?? undefined
    supplierId = supplierId ?? po?.supplierId ?? undefined
  }

  const id = createId()
  await tx.insert(warrantyBatches).values({
    id,
    warrantyProductId: d.warrantyProductId,
    source: d.source,
    purchaseOrderId: d.purchaseOrderId,
    supplierId,
    invoiceRef,
    unitsCovered: d.unitsCovered,
  })

  return { id }
}

export async function createWarrantyBatch(
  input: z.infer<typeof createBatchSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = createBatchSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let id = ""
  await db.transaction(async (tx) => {
    const result = await createWarrantyBatchCore(tx, parsed.data, session.user.id)
    id = result.id
  })
  revalidatePath("/admin/warranty")
  return { id }
}

// ─── Assignment (atomic — not an asset transition) ───────────────────────────

const assignSchema = z.object({
  assetId: z.string().trim().min(1),
  warrantyBatchId: z.string().trim().min(1),
  activationDueAt: z.string().optional(),
})

export async function assignWarrantyCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof assignSchema>,
  actorUserId: string | null
): Promise<{ id: string }> {
  const d = assignSchema.parse(input)

  const [asset] = await tx.select({ id: orderUnits.id }).from(orderUnits).where(eq(orderUnits.id, d.assetId))
  if (!asset) throw new Error("Asset not found")

  const [batch] = await tx.select().from(warrantyBatches).where(eq(warrantyBatches.id, d.warrantyBatchId))
  if (!batch) throw new Error("Warranty batch not found")
  if (batch.unitsAssigned >= batch.unitsCovered) throw new Error("Warranty batch fully assigned")

  const [existing] = await tx
    .select({ id: warrantyAssignments.id })
    .from(warrantyAssignments)
    .where(and(eq(warrantyAssignments.assetId, d.assetId), notInArray(warrantyAssignments.status, ["cancelled", "expired"])))
  if (existing) throw new Error("Asset already has an active warranty assignment")

  const id = createId()
  await tx.insert(warrantyAssignments).values({
    id,
    assetId: d.assetId,
    warrantyBatchId: d.warrantyBatchId,
    status: "assigned_not_activated",
    activationDueAt: d.activationDueAt ? new Date(d.activationDueAt).getTime() : null,
  })
  await tx
    .update(warrantyBatches)
    .set({ unitsAssigned: batch.unitsAssigned + 1 })
    .where(eq(warrantyBatches.id, batch.id))

  await emitDomainEvent(tx, {
    aggregateType: "asset",
    aggregateId: d.assetId,
    eventType: "WarrantyAssigned",
    payload: { warrantyAssignmentId: id, warrantyBatchId: batch.id },
    dedupeKey: `warranty_assignment:${id}:WarrantyAssigned`,
    actorUserId,
  })

  return { id }
}

export async function assignWarranty(input: z.infer<typeof assignSchema>): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = assignSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  await expireStaleWarranties()
  let id = ""
  try {
    await db.transaction(async (tx) => {
      const result = await assignWarrantyCore(tx, parsed.data, session.user.id)
      id = result.id
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to assign warranty" }
  }

  revalidatePath(`/admin/assets/${parsed.data.assetId}`)
  revalidatePath("/admin/warranty")
  return { id }
}

// ─── Activation ───────────────────────────────────────────────────────────────

export async function activateWarranty(assignmentId: string, startAtInput?: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [assignment] = await db
    .select()
    .from(warrantyAssignments)
    .where(eq(warrantyAssignments.id, assignmentId))
  if (!assignment) return { error: "Warranty assignment not found" }
  if (!["assigned_not_activated", "activation_pending"].includes(assignment.status)) {
    return { error: "Invalid action for current warranty status" }
  }

  const [batch] = await db
    .select({ durationMonths: warrantyProducts.durationMonths })
    .from(warrantyBatches)
    .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))
    .where(eq(warrantyBatches.id, assignment.warrantyBatchId))

  const startAt = startAtInput ? new Date(startAtInput).getTime() : Date.now()
  if (Number.isNaN(startAt)) return { error: "Invalid start date" }
  const endAt = startAt + (batch?.durationMonths ?? 12) * 30 * 24 * 60 * 60 * 1000

  await db.transaction(async (tx) => {
    await tx
      .update(warrantyAssignments)
      .set({ status: "active", startAt, endAt, updatedAt: Date.now() })
      .where(eq(warrantyAssignments.id, assignmentId))
    await emitDomainEvent(tx, {
      aggregateType: "asset",
      aggregateId: assignment.assetId,
      eventType: "WarrantyActivated",
      payload: { warrantyAssignmentId: assignmentId, startAt, endAt },
      dedupeKey: `warranty_assignment:${assignmentId}:WarrantyActivated`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath(`/admin/assets/${assignment.assetId}`)
  revalidatePath("/admin/warranty")
  return { id: assignmentId }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getWarrantyForAsset(assetId: string) {
  const session = await getStaffSession()
  if (!session) return null
  await expireStaleWarranties()
  const [row] = await db
    .select({
      id: warrantyAssignments.id,
      status: warrantyAssignments.status,
      activationDueAt: warrantyAssignments.activationDueAt,
      startAt: warrantyAssignments.startAt,
      endAt: warrantyAssignments.endAt,
      productNameEn: warrantyProducts.nameEn,
      productNameAr: warrantyProducts.nameAr,
      providerName: warrantyProducts.providerName,
    })
    .from(warrantyAssignments)
    .innerJoin(warrantyBatches, eq(warrantyAssignments.warrantyBatchId, warrantyBatches.id))
    .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))
    .where(and(eq(warrantyAssignments.assetId, assetId), notInArray(warrantyAssignments.status, ["cancelled"])))
    .orderBy(desc(warrantyAssignments.createdAt))
    .limit(1)
  return row ?? null
}

// ─── Warranty documents (invoice / certificate) ──────────────────────────────
// Reuses the provider-neutral attachment table (entityType: "warranty_assignment")
// on Vercel Blob only, same abstraction as asset documents (Milestone 2 / B4).

const ALLOWED_DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_DOC_SIZE_BYTES = 15 * 1024 * 1024

export async function getWarrantyDocuments(warrantyAssignmentId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityId, warrantyAssignmentId), eq(attachments.entityType, "warranty_assignment")))
    .orderBy(desc(attachments.createdAt))
}

export async function uploadWarrantyDocument(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const warrantyAssignmentId = String(formData.get("warrantyAssignmentId") ?? "")
  const file = formData.get("file")
  const kind = String(formData.get("kind") ?? "invoice")
  if (!(file instanceof File)) return { error: "No file provided" }
  if (!ALLOWED_DOC_TYPES.includes(file.type)) return { error: "Unsupported file type" }
  if (file.size > MAX_DOC_SIZE_BYTES) return { error: "File too large" }

  const [assignment] = await db
    .select({ id: warrantyAssignments.id })
    .from(warrantyAssignments)
    .where(eq(warrantyAssignments.id, warrantyAssignmentId))
  if (!assignment) return { error: "Warranty assignment not found" }

  const blob = await put(`warranty/${warrantyAssignmentId}/${kind}-${createId()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: false,
  })

  const id = createId()
  await db.insert(attachments).values({
    id,
    entityType: "warranty_assignment",
    entityId: warrantyAssignmentId,
    fileName: file.name,
    fileUrl: blob.url,
    fileType: file.type,
    fileSize: file.size,
    uploadedBy: session.user.id,
    uploadSource: "admin",
    provider: "vercel_blob",
    providerFileId: blob.pathname,
    providerUrl: blob.url,
    storagePath: blob.pathname,
    sensitivity: "sensitive",
  })

  revalidatePath("/admin/warranty")
  return { id }
}

// Warranty Center: operational buckets across all active assignments/batches.
// "Required but not purchased" is out of scope for this milestone — there is
// no existing data model linking a request/order line to a warranty
// requirement, so that bucket cannot be computed yet (tracked in backlog).
export async function getWarrantyCenter() {
  const session = await getStaffSession()
  if (!session) return null
  await expireStaleWarranties()
  const now = Date.now()
  const alertDays = await getWarrantyExpiryAlertDays()
  const soon = now + alertDays * DAY_MS

  const [purchasedNotAssigned, assignedNotActivated, activationOverdue, active, expiringSoon, expired] =
    await Promise.all([
      db
        .select({
          id: warrantyBatches.id,
          unitsCovered: warrantyBatches.unitsCovered,
          unitsAssigned: warrantyBatches.unitsAssigned,
          productNameEn: warrantyProducts.nameEn,
        })
        .from(warrantyBatches)
        .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))
        .where(gt(warrantyBatches.unitsCovered, warrantyBatches.unitsAssigned)),
      db
        .select({ id: warrantyAssignments.id, assetId: warrantyAssignments.assetId })
        .from(warrantyAssignments)
        .where(eq(warrantyAssignments.status, "assigned_not_activated")),
      db
        .select({ id: warrantyAssignments.id, assetId: warrantyAssignments.assetId })
        .from(warrantyAssignments)
        .where(
          and(
            notInArray(warrantyAssignments.status, ["active", "expired", "cancelled"]),
            lt(warrantyAssignments.activationDueAt, now)
          )
        ),
      db
        .select({ id: warrantyAssignments.id, assetId: warrantyAssignments.assetId, endAt: warrantyAssignments.endAt })
        .from(warrantyAssignments)
        .where(eq(warrantyAssignments.status, "active")),
      db
        .select({ id: warrantyAssignments.id, assetId: warrantyAssignments.assetId, endAt: warrantyAssignments.endAt })
        .from(warrantyAssignments)
        .where(and(eq(warrantyAssignments.status, "active"), lte(warrantyAssignments.endAt, soon), gt(warrantyAssignments.endAt, now))),
      db
        .select({ id: warrantyAssignments.id, assetId: warrantyAssignments.assetId })
        .from(warrantyAssignments)
        .where(eq(warrantyAssignments.status, "expired")),
    ])

  const assignmentIds = [...assignedNotActivated, ...active].map((a) => a.id)
  const certificatesPresent = assignmentIds.length
    ? await db
        .select({ entityId: attachments.entityId })
        .from(attachments)
        .where(eq(attachments.entityType, "warranty_assignment"))
    : []
  const withCertificate = new Set(certificatesPresent.map((c) => c.entityId))
  const certificateMissing = [...assignedNotActivated, ...active].filter((a) => !withCertificate.has(a.id))

  return {
    purchasedNotAssigned,
    assignedNotActivated,
    activationOverdue,
    active,
    expiringSoon,
    expired,
    certificateMissing,
  }
}

// ─── Bulk request: one batch, many assets, one step ──────────────────────────
// The operator selects N assets with no warranty (e.g. from the registry),
// picks a warranty type + provider once, and this creates a single batch
// sized to N plus an assignment per asset in one transaction — recording
// "the request went out", not activating anything. Activation (start/end
// dates) happens later per asset once the supplier's response comes back.

const requestWarrantyForAssetsSchema = z
  .object({
    assetIds: z.array(z.string().trim().min(1)).min(1).max(500),
    warrantyProductId: z.string().trim().min(1),
    source: z.enum(["with_device", "separate", "other_supplier", "bulk"]),
    supplierId: z.string().trim().min(1).optional(),
    purchaseOrderId: z.string().trim().min(1).optional(),
    invoiceRef: z.string().trim().max(120).optional(),
  })
  // "with_device" means the warranty was already requested alongside the
  // purchase PO — nothing to send out, just link it. Every other source is
  // an active request to a warranty provider, which needs a recipient.
  .refine((d) => d.source === "with_device" || !!d.supplierId, {
    message: "Warranty provider is required unless the warranty came with the device purchase",
    path: ["supplierId"],
  })

export async function requestWarrantyForAssets(
  input: z.infer<typeof requestWarrantyForAssetsSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = requestWarrantyForAssetsSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  await expireStaleWarranties()
  const d = parsed.data
  const assetIds = [...new Set(d.assetIds)]

  let batchId = ""
  try {
    await db.transaction(async (tx) => {
      batchId = createId()
      await tx.insert(warrantyBatches).values({
        id: batchId,
        warrantyProductId: d.warrantyProductId,
        source: d.source,
        purchaseOrderId: d.purchaseOrderId,
        supplierId: d.supplierId,
        invoiceRef: d.invoiceRef,
        unitsCovered: assetIds.length,
      })
      for (const assetId of assetIds) {
        await assignWarrantyCore(tx, { assetId, warrantyBatchId: batchId }, session.user.id)
      }
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to request warranty" }
  }

  revalidatePath("/admin/warranty")
  revalidatePath("/admin/warranty/registry")
  return { id: batchId }
}

// ─── Warranty registry: per-asset view ─────────────────────────────────────
// One row per physical asset (order_unit) — serial, device, supplier,
// purchase date, and its primary (latest non-cancelled) warranty assignment
// if any. Assets with zero warranty rows surface as "none", the gap the
// operator needs to close (activate Apple now, batch-request Lenovo later).

export type WarrantyRegistryStatus = "none" | "pending" | "active" | "expiring_soon" | "expired"

export type WarrantyRegistryRow = {
  assetId: string
  serialNumber: string | null
  assetTag: string | null
  brand: string | null
  model: string | null
  description: string | null
  supplierName: string | null
  purchaseDate: number | null
  warrantyStatus: WarrantyRegistryStatus
  warrantyType: string | null
  warrantyProvider: string | null
  startAt: number | null
  endAt: number | null
}

export async function getWarrantyRegistry(): Promise<WarrantyRegistryRow[]> {
  const session = await getStaffSession()
  if (!session) return []
  await expireStaleWarranties()
  const now = Date.now()
  const alertDays = await getWarrantyExpiryAlertDays()
  const soon = now + alertDays * DAY_MS

  const poLineBrand = sql<string | null>`(select brand from purchase_order_line where id = ${orderUnits.purchaseOrderLineId})`
  const poLineModel = sql<string | null>`(select model from purchase_order_line where id = ${orderUnits.purchaseOrderLineId})`
  const poLineDesc = sql<string | null>`(select item_description from purchase_order_line where id = ${orderUnits.purchaseOrderLineId})`
  const orderLineBrand = sql<string | null>`(select brand from order_line where id = ${orderUnits.orderLineId})`
  const orderLineModel = sql<string | null>`(select model from order_line where id = ${orderUnits.orderLineId})`
  const orderLineDesc = sql<string | null>`(select description from order_line where id = ${orderUnits.orderLineId})`

  const assets = await db
    .select({
      assetId: orderUnits.id,
      serialNumber: orderUnits.serialNumber,
      assetTag: orderUnits.assetTag,
      purchaseDate: orderUnits.purchaseDate,
      supplierName: suppliers.name,
      brand: sql<string | null>`coalesce(${poLineBrand}, ${orderLineBrand})`,
      model: sql<string | null>`coalesce(${poLineModel}, ${orderLineModel})`,
      description: sql<string | null>`coalesce(${poLineDesc}, ${orderLineDesc})`,
    })
    .from(orderUnits)
    .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
    .where(notInArray(orderUnits.status, ["retired", "lost"]))

  const warranties = await db
    .select({
      assetId: warrantyAssignments.assetId,
      status: warrantyAssignments.status,
      startAt: warrantyAssignments.startAt,
      endAt: warrantyAssignments.endAt,
      createdAt: warrantyAssignments.createdAt,
      productNameEn: warrantyProducts.nameEn,
      providerName: warrantyProducts.providerName,
      batchSupplierName: suppliers.name,
    })
    .from(warrantyAssignments)
    .innerJoin(warrantyBatches, eq(warrantyAssignments.warrantyBatchId, warrantyBatches.id))
    .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))
    .leftJoin(suppliers, eq(warrantyBatches.supplierId, suppliers.id))
    .where(notInArray(warrantyAssignments.status, ["cancelled"]))
    .orderBy(desc(warrantyAssignments.createdAt))

  // Latest non-cancelled assignment per asset (warranties is already sorted
  // newest-first, so the first match per assetId wins).
  const latestByAsset = new Map<string, (typeof warranties)[number]>()
  for (const w of warranties) {
    if (!latestByAsset.has(w.assetId)) latestByAsset.set(w.assetId, w)
  }

  return assets.map((asset) => {
    const w = latestByAsset.get(asset.assetId)
    if (!w) {
      return {
        ...asset,
        warrantyStatus: "none" as const,
        warrantyType: null,
        warrantyProvider: null,
        startAt: null,
        endAt: null,
      }
    }
    let warrantyStatus: WarrantyRegistryStatus
    if (w.status === "expired" || (w.endAt != null && w.endAt <= now)) warrantyStatus = "expired"
    else if (w.status === "active" && w.endAt != null && w.endAt <= soon) warrantyStatus = "expiring_soon"
    else if (w.status === "active") warrantyStatus = "active"
    else warrantyStatus = "pending"

    return {
      ...asset,
      warrantyStatus,
      warrantyType: w.productNameEn,
      warrantyProvider: w.batchSupplierName ?? w.providerName,
      startAt: w.startAt,
      endAt: w.endAt,
    }
  })
}
