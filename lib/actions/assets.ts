"use server"

import { and, count, desc, eq, isNull, like, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  assetEvents,
  customers,
  orderLines,
  orders,
  orderUnits,
  requests,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { type AssetAction, type AssetStatus } from "@/lib/domain/asset-status"
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"

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
        like(orderLines.model, q)
      )
    )
  }
  const where = conds.length ? and(...conds) : undefined

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
        description: orderLines.description,
        brand: orderLines.brand,
        model: orderLines.model,
        orderNumber: orders.orderNumber,
        supplierName: suppliers.name,
        currentCustomerName: customers.name,
        updatedAt: orderUnits.updatedAt,
      })
      .from(orderUnits)
      .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
      .innerJoin(orders, eq(orderUnits.orderId, orders.id))
      .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
      .leftJoin(customers, eq(orderUnits.currentCustomerId, customers.id))
      .where(where)
      .orderBy(desc(orderUnits.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(orderUnits)
      .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
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
      description: orderLines.description,
      brand: orderLines.brand,
      model: orderLines.model,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      supplierName: suppliers.name,
      currentCustomerName: customers.name,
    })
    .from(orderUnits)
    .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .innerJoin(orders, eq(orderUnits.orderId, orders.id))
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
