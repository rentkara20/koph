"use server"

import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"
import { and, count, desc, eq, inArray, isNull, like, notInArray, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { activityLogs, customerContacts, customers, orderUnits, partnerTasks, requestItems, requests, requestTypes, signatureRequests } from "@/lib/db/schema"
import { createId, generateTrackingCode } from "@/lib/utils/ids"
import { generateRequestNumber } from "@/lib/utils/request-number"
import { logActivity } from "@/lib/utils/activity"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { createRequestSchema, itemInputSchema, firstError } from "@/lib/validation/schemas"

export type ActionResult = { error?: string; id?: string }

type ItemInput = {
  description: string
  brand?: string
  model?: string
  serialNumber?: string
  quantity: number
  accessories?: string
  notes?: string
  orderUnitId?: string
}

export type CreateRequestInput = {
  typeId: string
  customerId: string
  quoteNumber?: string
  salesRef?: string
  poNumber?: string
  deliveryDate?: string
  collectionDate?: string
  timeWindow?: string
  requireNationalId: boolean
  notes?: string
  items: ItemInput[]
}

export async function createRequest(data: CreateRequestInput): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createRequestSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }


  const requestNumber = await generateRequestNumber()
  const trackingCode = generateTrackingCode()
  const id = createId()

  const pulledUnitIds = data.items
    .map((item) => item.orderUnitId)
    .filter((v): v is string => Boolean(v))

  try {
  await db.transaction(async (tx) => {
    await tx.insert(requests).values({
      id,
      requestNumber,
      trackingCode,
      typeId: data.typeId,
      customerId: data.customerId,
      quoteNumber: data.quoteNumber?.trim() || null,
      salesRef: data.salesRef || null,
      poNumber: data.poNumber || null,
      deliveryDate: data.deliveryDate ? new Date(data.deliveryDate).getTime() : null,
      collectionDate: data.collectionDate ? new Date(data.collectionDate).getTime() : null,
      timeWindow: data.timeWindow || null,
      requireNationalId: data.requireNationalId,
      notes: data.notes || null,
      status: "draft",
      createdBy: session.user.id,
    })

    if (data.items.length > 0) {
      await tx.insert(requestItems).values(
        data.items.map((item) => ({
          id: createId(),
          requestId: id,
          description: item.description,
          brand: item.brand || null,
          model: item.model || null,
          serialNumber: item.serialNumber || null,
          quantity: item.quantity,
          accessories: item.accessories || null,
          notes: item.notes || null,
          orderUnitId: item.orderUnitId || null,
        }))
      )

      // Mark pulled order units as assigned so they are not double-booked. Each
      // goes through the OI-1 chokepoint — its own concurrency-safe status
      // guard closes the race where two concurrent requests both read the same
      // "in_stock" unit as available, and the asset_event is written in the
      // SAME transaction as the request (was a best-effort post-tx call before).
      for (const unitId of pulledUnitIds) {
        await applyAssetTransition(tx, unitId, "assign", {
          requestId: id,
          customerId: data.customerId,
          byUserId: session.user.id,
        })
      }
    }
  })
  } catch (error) {
    if (error instanceof AssetTransitionError) {
      return {
        error:
          error.code === "CONCURRENT_MODIFICATION" || error.code === "INVALID_TRANSITION"
            ? "One or more selected devices were just claimed by another request. Please re-select available units."
            : error.message,
      }
    }
    throw error
  }

  await logActivity({
    entityType: "request",
    entityId: id,
    action: "created",
    i18nKey: "activity.requestCreated",
    performedBy: session.user.id,
  })

  revalidatePath("/admin/requests")
  return { id }
}

export type RequestListItem = {
  id: string
  requestNumber: string
  trackingCode: string
  quoteNumber: string | null
  status: string
  deliveryDate: number | null
  createdAt: number
  customerName: string | null
  typeName: string | null
}

export type RequestListPage = {
  rows: RequestListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const REQUESTS_PAGE_SIZE = 50

export async function getRequests(filters?: {
  status?: string
  search?: string
  page?: number
}): Promise<RequestListPage> {
  const empty: RequestListPage = { rows: [], total: 0, page: 1, pageSize: REQUESTS_PAGE_SIZE, totalPages: 0 }
  const session = await getStaffSession()
  if (!session) return empty

  const page = Math.max(1, filters?.page ?? 1)
  const offset = (page - 1) * REQUESTS_PAGE_SIZE

  const where = and(
    isNull(requests.deletedAt),
    filters?.status
      ? eq(
          requests.status,
          filters.status as
            | "draft"
            | "assigned"
            | "in_progress"
            | "completed"
            | "failed"
            | "on_hold"
            | "cancelled"
            | "rescheduled"
        )
      : undefined,
    filters?.search?.trim()
      ? or(
          like(requests.requestNumber, `%${filters.search.trim()}%`),
          like(requests.quoteNumber, `%${filters.search.trim()}%`),
          like(customers.name, `%${filters.search.trim()}%`)
        )
      : undefined
  )

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        trackingCode: requests.trackingCode,
        quoteNumber: requests.quoteNumber,
        status: requests.status,
        deliveryDate: requests.deliveryDate,
        createdAt: requests.createdAt,
        customerName: customers.name,
        typeName: requestTypes.nameEn,
      })
      .from(requests)
      .leftJoin(customers, eq(requests.customerId, customers.id))
      .leftJoin(requestTypes, eq(requests.typeId, requestTypes.id))
      .where(where)
      .orderBy(desc(requests.createdAt))
      .limit(REQUESTS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ value: count() })
      .from(requests)
      .leftJoin(customers, eq(requests.customerId, customers.id))
      .where(where),
  ])

  const total = totalResult[0]?.value ?? 0
  return {
    rows: rows as RequestListItem[],
    total,
    page,
    pageSize: REQUESTS_PAGE_SIZE,
    totalPages: Math.ceil(total / REQUESTS_PAGE_SIZE),
  }
}

export async function getRequest(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), isNull(requests.deletedAt)))

  if (!request) return null

  const [items, [customer], [requestType], logs] = await Promise.all([
    db.select().from(requestItems).where(eq(requestItems.requestId, id)),
    db.select().from(customers).where(eq(customers.id, request.customerId)),
    db.select().from(requestTypes).where(eq(requestTypes.id, request.typeId)),
    db
      .select()
      .from(activityLogs)
      .where(and(eq(activityLogs.entityType, "request"), eq(activityLogs.entityId, id)))
      .orderBy(desc(activityLogs.createdAt)),
  ])

  return { request, items, customer: customer ?? null, requestType: requestType ?? null, logs }
}

type ManualStatus = "on_hold" | "cancelled" | "rescheduled" | "failed"

// Return any order units reserved for this request back to in_stock. Called
// on cancel/fail/delete so cancelled work never leaves inventory permanently
// stuck in "assigned" — closes off a fleet-shrinkage bug.
async function releaseUnitsForRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  requestId: string,
  byUserId: string,
  itemIds?: string[]
) {
  const itemFilter = itemIds
    ? and(eq(requestItems.requestId, requestId), inArray(requestItems.id, itemIds))
    : eq(requestItems.requestId, requestId)

  const items = await tx
    .select({ orderUnitId: requestItems.orderUnitId })
    .from(requestItems)
    .where(itemFilter)
  const unitIds = items.map((i) => i.orderUnitId).filter((v): v is string => Boolean(v))
  if (unitIds.length === 0) return []

  const released: string[] = []
  for (const unitId of unitIds) {
    // Only assigned units are releasable (matches the previous conditional
    // update's guard) — a unit already delivered/returned elsewhere is left
    // alone rather than forced back to in_stock.
    try {
      await applyAssetTransition(tx, unitId, "unassign", { requestId, byUserId })
      released.push(unitId)
    } catch (error) {
      if (!(error instanceof AssetTransitionError && error.code === "INVALID_TRANSITION")) throw error
    }
  }

  return released
}

export async function updateRequestStatus(
  id: string,
  status: ManualStatus
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db.transaction(async (tx) => {
    await tx.update(requests).set({ status, updatedAt: Date.now() }).where(eq(requests.id, id))

    // Cancelling/failing a request must stop its partner tasks too — otherwise
    // partners keep working dead jobs via still-live magic links, and later
    // sign-offs would generate payments for cancelled work
    if (status === "cancelled" || status === "failed") {
      await tx
        .update(partnerTasks)
        .set({ status: "cancelled", taskTokenExpiresAt: Date.now(), updatedAt: Date.now() })
        .where(
          and(
            eq(partnerTasks.requestId, id),
            notInArray(partnerTasks.status, ["closed", "cancelled", "rejected", "failed"])
          )
        )
      // Asset events for released units are written atomically inside
      // releaseUnitsForRequest — no separate post-tx event pass needed.
      await releaseUnitsForRequest(tx, id, session.user.id)
    }
  })

  await logActivity({
    entityType: "request",
    entityId: id,
    action: "status_changed",
    i18nKey: "activity.statusChanged",
    i18nData: { status },
    performedBy: session.user.id,
  })

  revalidatePath(`/admin/requests/${id}`)
  revalidatePath("/admin/requests")
  return { id }
}

// Resume a manually held/rescheduled request back into the active flow by
// re-deriving its status from its tasks (mirror of syncRequestStatus, which
// deliberately never overrides manual statuses)
export async function resumeRequest(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
  if (!request) return { error: "Not found" }
  if (!["on_hold", "rescheduled", "failed", "cancelled"].includes(request.status)) {
    return { error: "Request is not paused" }
  }

  const tasks = await db.select().from(partnerTasks).where(eq(partnerTasks.requestId, id))
  const active = tasks.filter((t) =>
    ["pending", "accepted", "in_progress", "pending_signoff"].includes(t.status)
  )
  const closed = tasks.filter((t) => t.status === "closed")
  const inProgress = tasks.filter((t) => ["in_progress", "pending_signoff"].includes(t.status))

  const derived =
    inProgress.length > 0
      ? "in_progress"
      : active.length === 0 && closed.length > 0
        ? "completed"
        : active.length > 0
          ? "assigned"
          : "draft"

  await db
    .update(requests)
    .set({ status: derived as typeof request.status, updatedAt: Date.now() })
    .where(eq(requests.id, id))

  await logActivity({
    entityType: "request",
    entityId: id,
    action: "status_changed",
    i18nKey: "activity.statusChanged",
    i18nData: { status: derived },
    performedBy: session.user.id,
  })

  revalidatePath(`/admin/requests/${id}`)
  revalidatePath("/admin/requests")
  return { id }
}

export async function getRequestTypes() {
  return db
    .select()
    .from(requestTypes)
    .where(eq(requestTypes.isActive, true))
    .orderBy(requestTypes.sortOrder)
}

type ItemUpdateInput = {
  description: string
  brand?: string
  model?: string
  serialNumber?: string
  quantity: number
  accessories?: string
  notes?: string
}

// Items are part of what the customer signs (delivery note renders them live).
// Once a signature request left draft, editing items would silently change a
// signed/pending legal document — the audit hash would no longer match reality.
async function itemsAreFrozen(requestId: string): Promise<boolean> {
  const [sig] = await db
    .select({ id: signatureRequests.id })
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.requestId, requestId),
        notInArray(signatureRequests.status, ["draft", "cancelled", "rejected", "expired"])
      )
    )
    .limit(1)
  return !!sig
}

const ITEMS_FROZEN_ERROR =
  "Items are locked: a signature request is active or signed for this request"

export async function updateRequestItem(
  itemId: string,
  data: ItemUpdateInput
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  const parsedItem = itemInputSchema.safeParse(data)
  if (!parsedItem.success) return { error: firstError(parsedItem.error) }

  const [item] = await db
    .select({ requestId: requestItems.requestId })
    .from(requestItems)
    .where(eq(requestItems.id, itemId))
  if (!item) return { error: "Item not found" }
  if (await itemsAreFrozen(item.requestId)) return { error: ITEMS_FROZEN_ERROR }

  await db
    .update(requestItems)
    .set({
      description: data.description.trim(),
      brand: data.brand?.trim() || null,
      model: data.model?.trim() || null,
      serialNumber: data.serialNumber?.trim() || null,
      quantity: data.quantity,
      accessories: data.accessories?.trim() || null,
      notes: data.notes?.trim() || null,
      updatedAt: Date.now(),
    })
    .where(eq(requestItems.id, itemId))

  return {}
}

export async function deleteRequestItem(
  itemId: string,
  requestId: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (await itemsAreFrozen(requestId)) return { error: ITEMS_FROZEN_ERROR }

  await db.transaction(async (tx) => {
    // Asset events for released units are written atomically inside
    // releaseUnitsForRequest — no separate post-tx event pass needed.
    await releaseUnitsForRequest(tx, requestId, session.user.id, [itemId])
    await tx.delete(requestItems).where(eq(requestItems.id, itemId))
  })

  revalidatePath(`/admin/requests/${requestId}`)
  return {}
}

export async function setRequestReceiver(
  requestId: string,
  contactId: string | null
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  try {
    await db
      .update(requests)
      .set({ receiverContactId: contactId, updatedAt: Date.now() })
      .where(eq(requests.id, requestId))

    await logActivity({
      entityType: "request",
      entityId: requestId,
      action: "receiver_set",
      i18nKey: "activity.receiverSet",
      performedBy: session.user.id,
    })
  } catch (error) {
    console.error("requests: swallowed fallback error", error)
    return { error: "Failed to update receiver" }
  }

  revalidatePath(`/admin/requests/${requestId}`)
  return {}
}

export type LogisticsInput = {
  origin?: string | null
  destination?: string | null
  scheduledAt?: number | null
}

export async function setRequestLogistics(
  requestId: string,
  data: LogisticsInput
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  try {
    await db
      .update(requests)
      .set({
        origin: data.origin?.trim() || null,
        destination: data.destination?.trim() || null,
        scheduledAt: data.scheduledAt ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(requests.id, requestId))

    await logActivity({
      entityType: "request",
      entityId: requestId,
      action: "logistics_updated",
      i18nKey: "activity.logisticsUpdated",
      performedBy: session.user.id,
    })
  } catch (error) {
    console.error("requests: swallowed fallback error", error)
    return { error: "Failed to update logistics" }
  }

  revalidatePath(`/admin/requests/${requestId}`)
  return {}
}

export async function getRequestContacts(customerId: string) {
  try {
    return await db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, customerId))
      .orderBy(customerContacts.createdAt)
  } catch (error) {
    console.error("requests: swallowed fallback error", error)
    return []
  }
}

export async function addRequestItem(
  requestId: string,
  data: ItemUpdateInput
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  const parsedItem = itemInputSchema.safeParse(data)
  if (!parsedItem.success) return { error: firstError(parsedItem.error) }

  if (await itemsAreFrozen(requestId)) return { error: ITEMS_FROZEN_ERROR }

  const id = createId()
  await db.insert(requestItems).values({
    id,
    requestId,
    description: data.description.trim(),
    brand: data.brand?.trim() || null,
    model: data.model?.trim() || null,
    serialNumber: data.serialNumber?.trim() || null,
    quantity: data.quantity,
    accessories: data.accessories?.trim() || null,
    notes: data.notes?.trim() || null,
  })

  revalidatePath(`/admin/requests/${requestId}`)
  return { id }
}

export async function deleteRequest(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await db.transaction(async (tx) => {
    await tx.update(requests).set({ deletedAt: Date.now() }).where(eq(requests.id, id))

    // Kill live partner links on delete — a soft-deleted request must not stay
    // workable through task tokens
    await tx
      .update(partnerTasks)
      .set({ status: "cancelled", taskTokenExpiresAt: Date.now(), updatedAt: Date.now() })
      .where(
        and(
          eq(partnerTasks.requestId, id),
          notInArray(partnerTasks.status, ["closed", "cancelled", "rejected", "failed"])
        )
      )
    // Asset events for released units are written atomically inside
    // releaseUnitsForRequest — no separate post-tx event pass needed.
    await releaseUnitsForRequest(tx, id, session.user.id)
  })

  revalidatePath("/admin/requests")
  return {}
}
