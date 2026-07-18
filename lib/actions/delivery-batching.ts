"use server"

// Delivery Batching v2: one partner_task (one trip, one partner payment) can
// now span items from MULTIPLE customer requests — mirrors sourcing_v3's
// consolidated-RFQ entry point on the purchasing side. delivery_task_item is
// the source of truth for which requests a task covers; partner_task.requestId
// is kept only as a legacy/advisory pointer (set when a task happens to cover
// exactly one request, so every existing single-request UI/status/signature
// path keeps working unchanged — left null only for genuine cross-request
// batches). Request-level context (status sync, revalidation) is derived via
// getAffectedRequestIds, never read off the task row directly.
import { eq, inArray, notInArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  customers,
  partnerContracts,
  partnerTasks,
  requestItems,
  requests,
} from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { getSessionWithRole } from "@/lib/auth/session"
import { getTaskTokenTtlMs } from "@/lib/actions/settings"
import { createTaskSchema, firstError } from "@/lib/validation/schemas"
import { logActivity } from "@/lib/utils/activity"
import { resolveTaskContactId } from "@/lib/domain/task-contact"
import {
  allocateTaskItem,
  getAffectedRequestIds,
  syncRequestStatus,
  type ActionResult,
  type CreateTaskData,
} from "@/lib/actions/tasks"

// Only "cancelled" is genuinely terminal here — matches the existing
// single-request createTask/createFollowUpDeliveryTask precedent, which never
// blocked on request status besides that. A "failed" request can still get a
// follow-up delivery attempt (that's the whole point of
// resolveRequestAfterPartialDelivery's retry path).
type RequestStatus = (typeof requests.$inferSelect)["status"]
const NON_BATCHABLE_REQUEST_STATUSES: RequestStatus[] = ["cancelled"]

export type BatchedTaskItemInput = { requestItemId: string; qty: number }

// ─── Deliverable items — every remaining item across every open request ──────
// Same role as sourcing_v3's getUnsourcedItems: feeds the cross-request
// picking UI. "Remaining" here already accounts for open allocations via
// delivered/allocated quantity on request_item, same invariant tasks.ts's
// allocateTaskItem enforces at write time.

export type DeliverableItem = {
  id: string
  requestId: string
  requestNumber: string
  customerName: string | null
  description: string
  quantity: number
  deliveredQuantity: number
}

export async function getDeliverableItems(): Promise<DeliverableItem[]> {
  const session = await getSessionWithRole("admin")
  if (!session) return []

  const rows = await db
    .select({
      id: requestItems.id,
      requestId: requestItems.requestId,
      description: requestItems.description,
      quantity: requestItems.quantity,
      deliveredQuantity: requestItems.deliveredQuantity,
      requestNumber: requests.requestNumber,
      customerName: customers.name,
    })
    .from(requestItems)
    .innerJoin(requests, eq(requests.id, requestItems.requestId))
    .leftJoin(customers, eq(customers.id, requests.customerId))
    .where(notInArray(requests.status, NON_BATCHABLE_REQUEST_STATUSES))

  return rows.filter((r) => r.deliveredQuantity < r.quantity)
}

// ─── Batched task creation ────────────────────────────────────────────────────

async function createBatchedDeliveryTaskCore(
  items: BatchedTaskItemInput[],
  data: CreateTaskData,
  actorUserId: string
): Promise<ActionResult> {
  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + (await getTaskTokenTtlMs())
  const id = createId()

  try {
    await db.transaction(async (tx) => {
      const itemIds = items.map((i) => i.requestItemId)
      const itemRows = await tx
        .select({ id: requestItems.id, requestId: requestItems.requestId })
        .from(requestItems)
        .where(inArray(requestItems.id, itemIds))
      if (itemRows.length !== new Set(itemIds).size) {
        throw new Error("UNKNOWN_ITEM")
      }

      const affectedRequestIds = [...new Set(itemRows.map((r) => r.requestId))]
      const requestRows = await tx.select().from(requests).where(inArray(requests.id, affectedRequestIds))
      const terminal = requestRows.find(
        (r) => r.deletedAt || NON_BATCHABLE_REQUEST_STATUSES.includes(r.status)
      )
      if (terminal) throw new Error("TERMINAL_REQUEST")

      // Single-request batches keep the legacy requestId pointer set. Only a
      // genuine cross-request batch leaves it null.
      const singleRequestId = affectedRequestIds.length === 1 ? affectedRequestIds[0] : null
      const [singleRequest] = singleRequestId
        ? await tx.select({ receiverContactId: requests.receiverContactId }).from(requests).where(eq(requests.id, singleRequestId))
        : []

      await tx.insert(partnerTasks).values({
        id,
        requestId: singleRequestId,
        partnerId: data.partnerId,
        contractId: data.contractId || null,
        contactId: resolveTaskContactId(data.contactId, singleRequest?.receiverContactId ?? null),
        taskTypeId: data.taskTypeId || null,
        executionMode: data.executionMode ?? "manual",
        photoRequired: data.photoRequired ?? true,
        taskToken,
        taskTokenExpiresAt,
        status: "pending",
        notes: data.notes || null,
        assignedBy: actorUserId,
        assignedAt: Date.now(),
      })

      for (const item of items) {
        if (item.qty <= 0) continue
        const ok = await allocateTaskItem(tx, id, item.requestItemId, item.qty)
        if (!ok) throw new Error("ALLOCATION_FAILED")
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "ALLOCATION_FAILED") {
      return { error: "Not enough remaining quantity to allocate — another task may have claimed it. Refresh and retry." }
    }
    if (error instanceof Error && error.message === "UNKNOWN_ITEM") {
      return { error: "One or more items were not found" }
    }
    if (error instanceof Error && error.message === "TERMINAL_REQUEST") {
      return { error: "One or more items belong to a cancelled request" }
    }
    throw error
  }

  return { id, taskToken }
}

export async function createBatchedDeliveryTask(
  items: BatchedTaskItemInput[],
  data: CreateTaskData
): Promise<ActionResult & { requestIds?: string[] }> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createTaskSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }
  if (!items.length || items.every((i) => i.qty <= 0)) {
    return { error: "Select at least one item with a quantity to allocate" }
  }

  if (data.contractId) {
    const [contract] = await db.select().from(partnerContracts).where(eq(partnerContracts.id, data.contractId))
    if (!contract || contract.partnerId !== data.partnerId) {
      return { error: "Selected contract does not belong to the selected partner" }
    }
    if (contract.status !== "active") {
      return { error: "Selected contract is not active" }
    }
  }

  const created = await createBatchedDeliveryTaskCore(items, data, session.user.id)
  if (created.error) return created
  const { id, taskToken } = created

  const affectedRequestIds = await getAffectedRequestIds(id as string)

  await logActivity({
    entityType: "partner_task",
    entityId: id as string,
    action: "task_assigned",
    i18nKey: "activity.taskAssigned",
    performedBy: session.user.id,
  })

  for (const requestId of affectedRequestIds) {
    await syncRequestStatus(requestId)
    revalidatePath(`/admin/requests/${requestId}`)
  }

  return { id, taskToken, requestIds: affectedRequestIds }
}
