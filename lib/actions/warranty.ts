"use server"

// Warranty (Milestone 3 / P5). Separate module from Asset fields — a
// warranty is purchased (with a device, separately, from another supplier,
// or in bulk) as a warranty_batch, then assigned to an Asset as a
// warranty_assignment with its own activation lifecycle. Not an asset
// transition: assigning/activating warranty never touches order_unit.status.
import { and, desc, eq, gt, lt, lte, notInArray } from "drizzle-orm"
import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  attachments,
  orderUnits,
  purchaseOrders,
  warrantyAssignments,
  warrantyBatches,
  warrantyProducts,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"

type ActionResult = { error?: string; id?: string }
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function getWarrantyProducts() {
  const session = await getStaffSession()
  if (!session) return []
  return db.select().from(warrantyProducts).orderBy(desc(warrantyProducts.createdAt))
}

const createProductSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  durationMonths: z.number().int().min(1).max(120),
  providerName: z.string().trim().max(200).optional(),
})

export async function createWarrantyProduct(
  input: z.infer<typeof createProductSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = createProductSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const id = createId()
  await db.insert(warrantyProducts).values({ id, ...parsed.data })
  revalidatePath("/admin/warranty")
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
  invoiceRef: z.string().trim().max(120).optional(),
  unitsCovered: z.number().int().min(1).max(10000),
})

// Auto-inherits invoiceRef from the linked purchase order when the caller
// doesn't supply one — avoids duplicate data entry for "with_device" batches.
export async function createWarrantyBatch(
  input: z.infer<typeof createBatchSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = createBatchSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  let invoiceRef = d.invoiceRef
  if (!invoiceRef && d.purchaseOrderId) {
    const [po] = await db
      .select({ invoiceRef: purchaseOrders.invoiceRef })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, d.purchaseOrderId))
    invoiceRef = po?.invoiceRef ?? undefined
  }

  const id = createId()
  await db.insert(warrantyBatches).values({
    id,
    warrantyProductId: d.warrantyProductId,
    source: d.source,
    purchaseOrderId: d.purchaseOrderId,
    invoiceRef,
    unitsCovered: d.unitsCovered,
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

export async function activateWarranty(assignmentId: string): Promise<ActionResult> {
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

  const startAt = Date.now()
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
  const now = Date.now()
  const soon = now + THIRTY_DAYS_MS

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
