"use server"

import { and, desc, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  customers,
  partners,
  partnerContracts,
  partnerTasks,
  requestItems,
  requests,
  requestTypes,
} from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { logActivity } from "@/lib/utils/activity"
import { getSession } from "@/lib/auth/session"

export type ActionResult = { error?: string; id?: string; taskToken?: string }

// ─── Auto request status sync ─────────────────────────────────────────────────

const ACTIVE_STATUSES = ["pending", "accepted", "in_progress", "pending_signoff"] as const
const MANUAL_STATUSES = ["on_hold", "cancelled", "rescheduled", "failed"] as const

async function syncRequestStatus(requestId: string) {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!request) return

  // Never auto-override manual ops statuses
  if ((MANUAL_STATUSES as readonly string[]).includes(request.status)) return

  const tasks = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.requestId, requestId))

  if (tasks.length === 0) return

  const active = tasks.filter((t) => (ACTIVE_STATUSES as readonly string[]).includes(t.status))
  const closed = tasks.filter((t) => t.status === "closed")
  const inProgress = tasks.filter((t) =>
    (["in_progress", "pending_signoff"] as string[]).includes(t.status)
  )

  let newStatus: string | null = null

  if (tasks.length > 0 && request.status === "draft") {
    newStatus = "assigned"
  } else if (inProgress.length > 0 && request.status !== "in_progress") {
    newStatus = "in_progress"
  } else if (active.length === 0 && closed.length > 0 && request.status !== "completed") {
    newStatus = "completed"
  }

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
    taskTypeId?: string
    notes?: string
  }
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  if (!data.partnerId) return { error: "Partner is required" }

  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days

  const id = createId()
  await db.insert(partnerTasks).values({
    id,
    requestId,
    partnerId: data.partnerId,
    contractId: data.contractId || null,
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
    })
    .from(partnerTasks)
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .where(eq(partnerTasks.requestId, requestId))
    .orderBy(desc(partnerTasks.createdAt))
}

// ─── Admin: sign off task ─────────────────────────────────────────────────────

export async function signOffTask(
  taskId: string,
  quantity?: number
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }
  if (task.status !== "pending_signoff") return { error: "Task is not awaiting sign-off" }

  await db
    .update(partnerTasks)
    .set({
      status: "closed",
      signoffQuantity: quantity ?? null,
      closedBy: session.user.id,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(partnerTasks.id, taskId))

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
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }

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
  const session = await getSession()
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

  const [[customer], [requestType]] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, request.customerId)),
    db.select().from(requestTypes).where(eq(requestTypes.id, request.typeId)),
  ])

  return {
    task,
    request,
    partner: partner ?? null,
    customer: customer ?? null,
    items,
    requestType: requestType ?? null,
    isExpired: task.taskTokenExpiresAt < Date.now(),
  }
}

// ─── Public: update task via magic link ───────────────────────────────────────

type PartnerAction = "accept" | "reject" | "start" | "mark_done" | "mark_failed"

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["in_progress"],
  in_progress: ["pending_signoff", "failed"],
}

const ACTION_STATUS: Record<PartnerAction, string> = {
  accept: "accepted",
  reject: "rejected",
  start: "in_progress",
  mark_done: "pending_signoff",
  mark_failed: "failed",
}

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

  const newStatus = ACTION_STATUS[action]
  if (!ALLOWED_TRANSITIONS[task.status]?.includes(newStatus)) {
    return { error: "Invalid action for current task status" }
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
        eq(partnerContracts.status, "active")
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
