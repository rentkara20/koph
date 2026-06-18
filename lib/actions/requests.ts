"use server"

import { and, desc, eq, isNull, like, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { activityLogs, customerContacts, customers, requestItems, requests, requestTypes } from "@/lib/db/schema"
import { createId, generateTrackingCode } from "@/lib/utils/ids"
import { generateRequestNumber } from "@/lib/utils/request-number"
import { logActivity } from "@/lib/utils/activity"
import { getSession } from "@/lib/auth/session"

export type ActionResult = { error?: string; id?: string }

type ItemInput = {
  description: string
  brand?: string
  model?: string
  serialNumber?: string
  quantity: number
  accessories?: string
  notes?: string
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
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  if (!data.typeId) return { error: "Request type is required" }
  if (!data.customerId) return { error: "Customer is required" }


  const requestNumber = await generateRequestNumber()
  const trackingCode = generateTrackingCode()
  const id = createId()

  await db.insert(requests).values({
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
    await db.insert(requestItems).values(
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
      }))
    )
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

export async function getRequests(filters?: {
  status?: string
  search?: string
}): Promise<RequestListItem[]> {
  const session = await getSession()
  if (!session) return []

  const rows = await db
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
    .where(
      and(
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
    )
    .orderBy(desc(requests.createdAt))
    .limit(200)

  return rows as RequestListItem[]
}

export async function getRequest(id: string) {
  const session = await getSession()
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

export async function updateRequestStatus(
  id: string,
  status: ManualStatus
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db.update(requests).set({ status, updatedAt: Date.now() }).where(eq(requests.id, id))

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

export async function updateRequestItem(
  itemId: string,
  data: ItemUpdateInput
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }
  if (!data.description?.trim()) return { error: "Description is required" }

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
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db.delete(requestItems).where(eq(requestItems.id, itemId))
  revalidatePath(`/admin/requests/${requestId}`)
  return {}
}

export async function setRequestReceiver(
  requestId: string,
  contactId: string | null
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db
    .update(requests)
    .set({ receiverContactId: contactId, updatedAt: Date.now() })
    .where(eq(requests.id, requestId))

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
  } catch {
    return []
  }
}

export async function addRequestItem(
  requestId: string,
  data: ItemUpdateInput
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }
  if (!data.description?.trim()) return { error: "Description is required" }

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
