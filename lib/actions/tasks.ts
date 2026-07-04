"use server"

import { and, count, desc, eq, gt, isNull, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  attachments,
  customerContacts,
  customers,
  partners,
  partnerContracts,
  partnerPayments,
  partnerTasks,
  requestItems,
  requests,
  requestTypes,
} from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { logActivity } from "@/lib/utils/activity"
import { getSession, getSessionWithRole } from "@/lib/auth/session"
import {
  createTaskSchema,
  partnerActionSchema,
  failureReasonSchema,
  firstError,
} from "@/lib/validation/schemas"
import {
  type PartnerAction,
  ACTION_STATUS,
  canTransition,
} from "@/lib/domain/task-status"
import { deriveRequestStatus } from "@/lib/domain/request-status"
import { computePayment, requiresQuantity, type PricingModel } from "@/lib/domain/pricing"

export type ActionResult = { error?: string; id?: string; taskToken?: string }

// ─── Auto request status sync ─────────────────────────────────────────────────
// Pure derivation lives in lib/domain/request-status.ts (unit-tested); this
// wrapper handles the DB read/write around it.

async function syncRequestStatus(requestId: string) {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!request) return

  const tasks = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.requestId, requestId))

  const newStatus = deriveRequestStatus(request.status, tasks.map((t) => t.status))

  if (newStatus) {
    await db
      .update(requests)
      .set({ status: newStatus as typeof request.status, updatedAt: Date.now() })
      .where(eq(requests.id, requestId))

    await logActivity({
      entityType: "request",
      entityId: requestId,
      action: "status_changed",
      i18nKey: "activity.statusChanged",
      i18nData: { status: newStatus },
      performedAs: "system",
    })
  }
}

// ─── Admin: create task ───────────────────────────────────────────────────────

export async function createTask(
  requestId: string,
  data: {
    partnerId: string
    contractId?: string
    contactId?: string
    taskTypeId?: string
    notes?: string
  }
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createTaskSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days

  const id = createId()
  await db.insert(partnerTasks).values({
    id,
    requestId,
    partnerId: data.partnerId,
    contractId: data.contractId || null,
    contactId: data.contactId || null,
    taskTypeId: data.taskTypeId || null,
    taskToken,
    taskTokenExpiresAt,
    status: "pending",
    notes: data.notes || null,
    assignedBy: session.user.id,
    assignedAt: Date.now(),
  })

  await logActivity({
    entityType: "request",
    entityId: requestId,
    action: "task_assigned",
    i18nKey: "activity.taskAssigned",
    performedBy: session.user.id,
  })

  await syncRequestStatus(requestId)
  revalidatePath(`/admin/requests/${requestId}`)
  return { id, taskToken }
}

// ─── Admin: get tasks for a request ──────────────────────────────────────────

export async function getTasksForRequest(requestId: string) {
  const session = await getSession()
  if (!session) return []

  return db
    .select({
      id: partnerTasks.id,
      taskToken: partnerTasks.taskToken,
      taskTokenExpiresAt: partnerTasks.taskTokenExpiresAt,
      status: partnerTasks.status,
      notes: partnerTasks.notes,
      failureReason: partnerTasks.failureReason,
      failureNotes: partnerTasks.failureNotes,
      signoffQuantity: partnerTasks.signoffQuantity,
      assignedAt: partnerTasks.assignedAt,
      closedAt: partnerTasks.closedAt,
      createdAt: partnerTasks.createdAt,
      partnerId: partnerTasks.partnerId,
      partnerName: partners.name,
      contractId: partnerTasks.contractId,
      pricingModel: partnerContracts.pricingModel,
      unitPrice: partnerContracts.unitPrice,
      contactId: partnerTasks.contactId,
      contactName: customerContacts.name,
      contactCity: customerContacts.city,
    })
    .from(partnerTasks)
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .leftJoin(partnerContracts, eq(partnerTasks.contractId, partnerContracts.id))
    .leftJoin(customerContacts, eq(partnerTasks.contactId, customerContacts.id))
    .where(eq(partnerTasks.requestId, requestId))
    .orderBy(desc(partnerTasks.createdAt))
}

// ─── Admin: sign off task ─────────────────────────────────────────────────────

export async function signOffTask(
  taskId: string,
  quantity?: number
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }
  if (task.status !== "pending_signoff") return { error: "Task is not awaiting sign-off" }

  // Never generate payment for work under a cancelled/deleted request
  const [parentRequest] = await db.select().from(requests).where(eq(requests.id, task.requestId))
  if (!parentRequest || parentRequest.deletedAt) return { error: "Request no longer exists" }
  if (["cancelled", "failed"].includes(parentRequest.status)) {
    return { error: "Cannot sign off a task on a cancelled request" }
  }

  const contract = task.contractId
    ? (
        await db
          .select()
          .from(partnerContracts)
          .where(eq(partnerContracts.id, task.contractId))
      )[0]
    : null

  // For quantity-based pricing an omitted quantity would silently pay for 1
  // unit — require an explicit number instead of guessing
  if (contract && requiresQuantity(contract.pricingModel as PricingModel) && !quantity) {
    return { error: "Quantity is required for this contract's pricing model" }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partnerTasks)
      .set({
        status: "closed",
        signoffQuantity: quantity ?? null,
        closedBy: session.user.id,
        closedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(partnerTasks.id, taskId))

    // Auto-create partner_payment when task has a contract
    if (contract) {
      const { quantity: finalQty, totalAmount } = computePayment(
        contract.pricingModel as PricingModel,
        contract.unitPrice,
        quantity
      )

      await tx.insert(partnerPayments).values({
        id: createId(),
        partnerId: task.partnerId,
        partnerTaskId: task.id,
        pricingModel: contract.pricingModel,
        quantity: finalQty,
        unitPrice: contract.unitPrice,
        totalAmount,
        status: "pending",
      })
    }
  })

  await logActivity({
    entityType: "request",
    entityId: task.requestId,
    action: "task_signed_off",
    i18nKey: "activity.taskSignedOff",
    performedBy: session.user.id,
  })

  await syncRequestStatus(task.requestId)
  revalidatePath(`/admin/requests/${task.requestId}`)
  return { id: taskId }
}

// ─── Admin: cancel task ───────────────────────────────────────────────────────

export async function cancelTask(taskId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }
  // A closed task already generated a partner payment — cancelling it would
  // leave that payment flowing into the next batch for cancelled work
  if (task.status === "closed") return { error: "Closed tasks cannot be cancelled" }
  if (task.status === "cancelled") return { error: "Task is already cancelled" }

  await db
    .update(partnerTasks)
    .set({ status: "cancelled", taskTokenExpiresAt: Date.now(), updatedAt: Date.now() })
    .where(eq(partnerTasks.id, taskId))

  await logActivity({
    entityType: "request",
    entityId: task.requestId,
    action: "task_cancelled",
    i18nKey: "activity.taskCancelled",
    performedBy: session.user.id,
  })

  await syncRequestStatus(task.requestId)
  revalidatePath(`/admin/requests/${task.requestId}`)
  return { id: taskId }
}

// ─── Admin: regenerate task link ──────────────────────────────────────────────

export async function regenerateTaskLink(taskId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }

  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000

  await db
    .update(partnerTasks)
    .set({ taskToken, taskTokenExpiresAt, updatedAt: Date.now() })
    .where(eq(partnerTasks.id, taskId))

  await logActivity({
    entityType: "request",
    entityId: task.requestId,
    action: "task_link_regenerated",
    i18nKey: "activity.taskLinkRegenerated",
    performedBy: session.user.id,
  })

  revalidatePath(`/admin/requests/${task.requestId}`)
  return { id: taskId, taskToken }
}

// ─── Public: get task by token ────────────────────────────────────────────────

export async function getTaskByToken(token: string) {
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, token))

  if (!task) return null

  const [[request], [partner], items] = await Promise.all([
    db.select().from(requests).where(eq(requests.id, task.requestId)),
    db.select().from(partners).where(eq(partners.id, task.partnerId)),
    db.select().from(requestItems).where(eq(requestItems.requestId, task.requestId)),
  ])

  if (!request) return null

  const [[customer], [requestType], linkedContact] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, request.customerId)),
    db.select().from(requestTypes).where(eq(requestTypes.id, request.typeId)),
    task.contactId
      ? db.select().from(customerContacts).where(eq(customerContacts.id, task.contactId))
      : Promise.resolve([]),
  ])

  return {
    task,
    request,
    partner: partner ?? null,
    customer: customer ?? null,
    items,
    requestType: requestType ?? null,
    linkedContact: linkedContact[0] ?? null,
    isExpired: task.taskTokenExpiresAt < Date.now(),
  }
}

export async function getTaskPhotos(taskId: string) {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityId, taskId), eq(attachments.entityType, "partner_task")))
}

// ─── Public: update task via magic link ───────────────────────────────────────
// State machine (ALLOWED_TRANSITIONS/ACTION_STATUS/canTransition) lives in
// lib/domain/task-status.ts and is unit-tested.

export async function updateTaskByToken(
  token: string,
  action: PartnerAction,
  data?: { failureReason?: string; failureNotes?: string }
): Promise<ActionResult> {
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, token))

  if (!task) return { error: "Task not found" }
  if (task.taskTokenExpiresAt < Date.now()) return { error: "Link expired" }

  const actionParsed = partnerActionSchema.safeParse(action)
  if (!actionParsed.success) return { error: "Invalid action" }
  if (action === "mark_failed" && data?.failureReason) {
    if (!failureReasonSchema.safeParse(data.failureReason).success) {
      return { error: "Invalid failure reason" }
    }
  }

  const newStatus = ACTION_STATUS[action]
  if (!canTransition(task.status, action)) {
    return { error: "Invalid action for current task status" }
  }

  // Proof-of-delivery: require at least one photo before a partner can mark a
  // delivery done. Failures are exempt (photo may be impossible on-site).
  if (newStatus === "pending_signoff") {
    const [{ value: photoCount }] = await db
      .select({ value: count() })
      .from(attachments)
      .where(and(eq(attachments.entityId, task.id), eq(attachments.entityType, "partner_task")))
    if (photoCount === 0) {
      return { error: "PHOTO_REQUIRED" }
    }
  }

  const updates: Partial<typeof partnerTasks.$inferInsert> = {
    status: newStatus as typeof task.status,
    updatedAt: Date.now(),
  }

  if (newStatus === "accepted") updates.acceptedAt = Date.now()
  if (newStatus === "pending_signoff") updates.completedAt = Date.now()
  if (newStatus === "failed") {
    if (!data?.failureReason) return { error: "Failure reason is required" }
    updates.failureReason = data.failureReason as typeof task.failureReason
    updates.failureNotes = data.failureNotes ?? null
  }
  if (["rejected", "failed"].includes(newStatus)) {
    updates.taskTokenExpiresAt = Date.now()
  }

  await db.update(partnerTasks).set(updates).where(eq(partnerTasks.taskToken, token))

  await logActivity({
    entityType: "request",
    entityId: task.requestId,
    action: `task_${action}`,
    i18nKey: `activity.task_${action}`,
    performedAs: "partner_link",
  })

  await syncRequestStatus(task.requestId)
  return { id: task.id }
}

// ─── Admin: get all active contracts by partner (for assign form) ─────────────

export async function getPartnersWithContracts() {
  const session = await getSession()
  if (!session) return []

  const rows = await db
    .select({
      partnerId: partners.id,
      partnerName: partners.name,
      contractId: partnerContracts.id,
      contractName: partnerContracts.name,
      pricingModel: partnerContracts.pricingModel,
      unitPrice: partnerContracts.unitPrice,
    })
    .from(partners)
    .leftJoin(
      partnerContracts,
      and(
        eq(partnerContracts.partnerId, partners.id),
        eq(partnerContracts.status, "active"),
        // status "active" alone isn't enough — nothing auto-expires contracts,
        // so also exclude ones whose end date already passed
        or(isNull(partnerContracts.endDate), gt(partnerContracts.endDate, Date.now()))
      )
    )
    .where(and(isNull(partners.deletedAt), eq(partners.status, "active")))
    .orderBy(partners.name)

  // Group contracts by partner
  const map = new Map<string, { id: string; name: string; contracts: typeof rows }>()
  for (const row of rows) {
    if (!map.has(row.partnerId)) {
      map.set(row.partnerId, { id: row.partnerId, name: row.partnerName, contracts: [] })
    }
    if (row.contractId) {
      map.get(row.partnerId)!.contracts.push(row)
    }
  }

  return Array.from(map.values())
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [task] = await db
    .select({ requestId: partnerTasks.requestId, status: partnerTasks.status })
    .from(partnerTasks)
    .where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Not found" }
  // Closed tasks have payment records referencing them — deleting would orphan the payment
  if (task.status === "closed") return { error: "Closed tasks cannot be deleted" }

  await db.delete(partnerTasks).where(eq(partnerTasks.id, taskId))

  revalidatePath(`/admin/requests/${task.requestId}`)
  return {}
}
