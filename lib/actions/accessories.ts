"use server"

// Accessories (Milestone 3 / P6). Three categories: serialized_asset (should
// really be tracked as an Asset — this module only handles trackable /
// non_serialized in practice), trackable (optional serial, unit rows), and
// non_serialized (quantity by location). Attaching to a request/asset and
// the delivery/collection checklist are atomic, own-event operations —
// distinct from asset status transitions.
import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { accessoryAttachments, accessoryItems, accessoryStock, accessoryUnits } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"

type ActionResult = { error?: string; id?: string }
const DEFAULT_LOCATION = "main_warehouse"

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function getAccessoryItems() {
  const session = await getStaffSession()
  if (!session) return []
  return db.select().from(accessoryItems).orderBy(desc(accessoryItems.createdAt))
}

const createItemSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  category: z.enum(["serialized_asset", "trackable", "non_serialized"]),
  requiresSerial: z.boolean().default(false),
})

export async function createAccessoryItem(input: z.infer<typeof createItemSchema>): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = createItemSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const id = createId()
  await db.insert(accessoryItems).values({ id, ...parsed.data })
  revalidatePath("/admin/accessories")
  return { id }
}

// ─── Stock (non-serialized) & Units (serialized / trackable) ────────────────

export async function getAccessoryStock() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: accessoryStock.id,
      accessoryItemId: accessoryStock.accessoryItemId,
      location: accessoryStock.location,
      qty: accessoryStock.qty,
      nameEn: accessoryItems.nameEn,
    })
    .from(accessoryStock)
    .innerJoin(accessoryItems, eq(accessoryStock.accessoryItemId, accessoryItems.id))
    .orderBy(desc(accessoryStock.updatedAt))
}

export async function getAccessoryUnits() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: accessoryUnits.id,
      accessoryItemId: accessoryUnits.accessoryItemId,
      serialNumber: accessoryUnits.serialNumber,
      status: accessoryUnits.status,
      nameEn: accessoryItems.nameEn,
    })
    .from(accessoryUnits)
    .innerJoin(accessoryItems, eq(accessoryUnits.accessoryItemId, accessoryItems.id))
    .orderBy(desc(accessoryUnits.createdAt))
}

// Procurement receiving for accessories: quantity for non_serialized items,
// or a unit row (with optional serial) for trackable items.
const receiveAccessorySchema = z.object({
  accessoryItemId: z.string().trim().min(1),
  qty: z.number().int().min(1).max(10000).optional(),
  serialNumber: z.string().trim().max(120).optional(),
})

export async function receiveAccessoryStock(
  input: z.infer<typeof receiveAccessorySchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = receiveAccessorySchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const [item] = await db.select().from(accessoryItems).where(eq(accessoryItems.id, d.accessoryItemId))
  if (!item) return { error: "Accessory item not found" }

  if (item.category === "non_serialized") {
    const qty = d.qty ?? 1
    const [existing] = await db
      .select()
      .from(accessoryStock)
      .where(and(eq(accessoryStock.accessoryItemId, item.id), eq(accessoryStock.location, DEFAULT_LOCATION)))
    if (existing) {
      await db
        .update(accessoryStock)
        .set({ qty: existing.qty + qty, updatedAt: Date.now() })
        .where(eq(accessoryStock.id, existing.id))
    } else {
      await db.insert(accessoryStock).values({ id: createId(), accessoryItemId: item.id, location: DEFAULT_LOCATION, qty })
    }
    revalidatePath("/admin/accessories")
    return { id: item.id }
  }

  if (item.requiresSerial && !d.serialNumber?.trim()) return { error: "Serial number required for this item" }
  const id = createId()
  await db.insert(accessoryUnits).values({
    id,
    accessoryItemId: item.id,
    serialNumber: d.serialNumber?.trim() || null,
    status: "in_stock",
    location: DEFAULT_LOCATION,
  })
  revalidatePath("/admin/accessories")
  return { id }
}

// ─── Attach / checklist (delivery, collection, missing/damaged) ────────────

const attachSchema = z.object({
  entityType: z.enum(["request", "asset"]),
  entityId: z.string().trim().min(1),
  accessoryItemId: z.string().trim().min(1),
  accessoryUnitId: z.string().trim().min(1).optional(),
  qty: z.number().int().min(1).max(10000).optional(),
  notes: z.string().trim().max(1000).optional(),
})

// Exported separately so integration tests can exercise the atomic attach
// path directly, same rationale as createAssetCore/assignWarrantyCore.
export async function attachAccessoryCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof attachSchema>,
  actorUserId: string | null
): Promise<{ id: string }> {
  const d = attachSchema.parse(input)

  const [item] = await tx.select().from(accessoryItems).where(eq(accessoryItems.id, d.accessoryItemId))
  if (!item) throw new Error("Accessory item not found")

  if (item.category === "non_serialized") {
    const qty = d.qty ?? 1
    const [stock] = await tx
      .select()
      .from(accessoryStock)
      .where(and(eq(accessoryStock.accessoryItemId, item.id), eq(accessoryStock.location, DEFAULT_LOCATION)))
    if (!stock || stock.qty < qty) throw new Error("Not enough stock for this accessory")
    await tx.update(accessoryStock).set({ qty: stock.qty - qty, updatedAt: Date.now() }).where(eq(accessoryStock.id, stock.id))
  } else {
    if (!d.accessoryUnitId) throw new Error("A specific unit is required for this accessory")
    const [unit] = await tx.select().from(accessoryUnits).where(eq(accessoryUnits.id, d.accessoryUnitId))
    if (!unit) throw new Error("Accessory unit not found")
    if (unit.status !== "in_stock") throw new Error("Accessory unit is not available")
    await tx.update(accessoryUnits).set({ status: "assigned", updatedAt: Date.now() }).where(eq(accessoryUnits.id, unit.id))
  }

  const attachmentId = createId()
  await tx.insert(accessoryAttachments).values({
    id: attachmentId,
    entityType: d.entityType,
    entityId: d.entityId,
    accessoryItemId: item.id,
    accessoryUnitId: d.accessoryUnitId,
    qty: item.category === "non_serialized" ? d.qty ?? 1 : null,
    checklistState: "delivered",
    notes: d.notes,
    byUserId: actorUserId,
  })

  await emitDomainEvent(tx, {
    aggregateType: d.entityType,
    aggregateId: d.entityId,
    eventType: "AccessoryAttached",
    payload: { accessoryAttachmentId: attachmentId, accessoryItemId: item.id },
    dedupeKey: `accessory_attachment:${attachmentId}:AccessoryAttached`,
    actorUserId,
  })

  return { id: attachmentId }
}

// Atomic: for non_serialized, decrements stock; for trackable/serialized,
// marks the unit assigned. Both write one accessory_attachment row + emit
// AccessoryAttached — not an asset status transition.
export async function attachAccessory(input: z.infer<typeof attachSchema>): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = attachSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let attachmentId = ""
  try {
    await db.transaction(async (tx) => {
      const result = await attachAccessoryCore(tx, parsed.data, session.user.id)
      attachmentId = result.id
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to attach accessory" }
  }

  revalidatePath(`/admin/${parsed.data.entityType}s/${parsed.data.entityId}`)
  return { id: attachmentId }
}

const checklistSchema = z.object({
  attachmentId: z.string().trim().min(1),
  checklistState: z.enum(["delivered", "collected", "missing", "damaged"]),
})

export async function updateAccessoryChecklistCore(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof checklistSchema>,
  actorUserId: string | null
): Promise<{ id: string; entityType: string; entityId: string }> {
  const d = checklistSchema.parse(input)

  const [attachment] = await tx.select().from(accessoryAttachments).where(eq(accessoryAttachments.id, d.attachmentId))
  if (!attachment) throw new Error("Accessory attachment not found")

  await tx
    .update(accessoryAttachments)
    .set({ checklistState: d.checklistState })
    .where(eq(accessoryAttachments.id, d.attachmentId))

  if (d.checklistState === "collected") {
    if (attachment.accessoryUnitId) {
      await tx
        .update(accessoryUnits)
        .set({ status: "in_stock", updatedAt: Date.now() })
        .where(eq(accessoryUnits.id, attachment.accessoryUnitId))
    } else if (attachment.qty) {
      const [stock] = await tx
        .select()
        .from(accessoryStock)
        .where(and(eq(accessoryStock.accessoryItemId, attachment.accessoryItemId), eq(accessoryStock.location, DEFAULT_LOCATION)))
      if (stock) {
        await tx.update(accessoryStock).set({ qty: stock.qty + attachment.qty, updatedAt: Date.now() }).where(eq(accessoryStock.id, stock.id))
      } else {
        await tx.insert(accessoryStock).values({ id: createId(), accessoryItemId: attachment.accessoryItemId, location: DEFAULT_LOCATION, qty: attachment.qty })
      }
    }
    await emitDomainEvent(tx, {
      aggregateType: attachment.entityType,
      aggregateId: attachment.entityId,
      eventType: "AccessoryReturned",
      payload: { accessoryAttachmentId: attachment.id },
      dedupeKey: `accessory_attachment:${attachment.id}:AccessoryReturned`,
      actorUserId,
    })
  } else if ((d.checklistState === "missing" || d.checklistState === "damaged") && attachment.accessoryUnitId) {
    await tx
      .update(accessoryUnits)
      .set({ status: d.checklistState, updatedAt: Date.now() })
      .where(eq(accessoryUnits.id, attachment.accessoryUnitId))
  }

  return { id: d.attachmentId, entityType: attachment.entityType, entityId: attachment.entityId }
}

// Collection / return path: restocks qty or returns the unit to stock, unless
// missing/damaged (kept out of circulation, flagged for review).
export async function updateAccessoryChecklist(
  input: z.infer<typeof checklistSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const parsed = checklistSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let result: { id: string; entityType: string; entityId: string } | null = null
  try {
    await db.transaction(async (tx) => {
      result = await updateAccessoryChecklistCore(tx, parsed.data, session.user.id)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update checklist" }
  }

  revalidatePath(`/admin/${result!.entityType}s/${result!.entityId}`)
  return { id: result!.id }
}

export async function getAccessoriesForEntity(entityType: "request" | "asset", entityId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: accessoryAttachments.id,
      accessoryItemId: accessoryAttachments.accessoryItemId,
      accessoryUnitId: accessoryAttachments.accessoryUnitId,
      qty: accessoryAttachments.qty,
      checklistState: accessoryAttachments.checklistState,
      createdAt: accessoryAttachments.createdAt,
      nameEn: accessoryItems.nameEn,
      serialNumber: accessoryUnits.serialNumber,
    })
    .from(accessoryAttachments)
    .innerJoin(accessoryItems, eq(accessoryAttachments.accessoryItemId, accessoryItems.id))
    .leftJoin(accessoryUnits, eq(accessoryAttachments.accessoryUnitId, accessoryUnits.id))
    .where(and(eq(accessoryAttachments.entityType, entityType), eq(accessoryAttachments.entityId, entityId)))
    .orderBy(desc(accessoryAttachments.createdAt))
}
