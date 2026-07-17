"use server"

// Products-for-sale quantity stock (formerly "Accessories", Milestone 3 / P6).
// This module now backs the NON-serialized side of products-for-sale: quantity
// counted by location. Serialized sold products are order_units with
// kind="sale" (see lib/actions/products.ts) — NOT this module.
//
// The `category` column is a legacy tracking-mode tag, not the rental/sale
// classifier (that is order_unit.kind). Its value "serialized_asset" predates
// the rental/sale split and is misleading: a serialized sold product should be
// created as an order_unit(kind="sale"), not here. The value is kept as-is for
// now because renaming it requires a production data migration; category still
// only meaningfully drives the trackable / non_serialized stock paths below.
// Attaching to a request/asset and the delivery/collection checklist are
// atomic, own-event operations — distinct from asset status transitions.
import { and, desc, eq, gte, ne, sql } from "drizzle-orm"
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
  revalidatePath("/admin/products")
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
    // Atomic upsert on the (accessoryItemId, location) unique index — a
    // read-then-write increment would drop concurrent/double-clicked receives.
    await db
      .insert(accessoryStock)
      .values({ id: createId(), accessoryItemId: item.id, location: DEFAULT_LOCATION, qty })
      .onConflictDoUpdate({
        target: [accessoryStock.accessoryItemId, accessoryStock.location],
        set: { qty: sql`${accessoryStock.qty} + ${qty}`, updatedAt: Date.now() },
      })
    revalidatePath("/admin/products")
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
  revalidatePath("/admin/products")
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
    // Atomic compare-and-set decrement: two concurrent attaches of the last
    // units must not both pass a stale `qty >= n` check and oversell to a
    // negative balance. rowsAffected === 0 means insufficient (or missing) stock.
    const decremented = await tx
      .update(accessoryStock)
      .set({ qty: sql`${accessoryStock.qty} - ${qty}`, updatedAt: Date.now() })
      .where(
        and(
          eq(accessoryStock.accessoryItemId, item.id),
          eq(accessoryStock.location, DEFAULT_LOCATION),
          gte(accessoryStock.qty, qty)
        )
      )
    if (((decremented as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
      throw new Error("Not enough stock for this accessory")
    }
  } else {
    if (!d.accessoryUnitId) throw new Error("A specific unit is required for this accessory")
    const [unit] = await tx.select().from(accessoryUnits).where(eq(accessoryUnits.id, d.accessoryUnitId))
    if (!unit) throw new Error("Accessory unit not found")
    // Guarded status flip: a concurrent double-attach of the same physical unit
    // must not both succeed (two attachment rows for one unit).
    const assigned = await tx
      .update(accessoryUnits)
      .set({ status: "assigned", updatedAt: Date.now() })
      .where(and(eq(accessoryUnits.id, unit.id), eq(accessoryUnits.status, "in_stock")))
    if (((assigned as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
      throw new Error("Accessory unit is not available")
    }
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

  // Guard the state transition: a double-submit of the same checklist state
  // (e.g. two "collected" clicks) must run the stock side-effects only ONCE,
  // otherwise a collect would restock the returned qty twice (stock inflation).
  const transitioned = await tx
    .update(accessoryAttachments)
    .set({ checklistState: d.checklistState })
    .where(and(eq(accessoryAttachments.id, d.attachmentId), ne(accessoryAttachments.checklistState, d.checklistState)))
  if (((transitioned as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
    // Already in this state — no-op, no duplicate restock/event.
    return { id: d.attachmentId, entityType: attachment.entityType, entityId: attachment.entityId }
  }

  if (d.checklistState === "collected") {
    if (attachment.accessoryUnitId) {
      await tx
        .update(accessoryUnits)
        .set({ status: "in_stock", updatedAt: Date.now() })
        .where(eq(accessoryUnits.id, attachment.accessoryUnitId))
    } else if (attachment.qty) {
      // Atomic increment restock (avoids lost update under concurrent collects).
      const restocked = await tx
        .update(accessoryStock)
        .set({ qty: sql`${accessoryStock.qty} + ${attachment.qty}`, updatedAt: Date.now() })
        .where(and(eq(accessoryStock.accessoryItemId, attachment.accessoryItemId), eq(accessoryStock.location, DEFAULT_LOCATION)))
      if (((restocked as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
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
