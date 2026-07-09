"use server"

import { and, count, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  attachments,
  customerContacts,
  customers,
  notifications,
  partners,
  partnerContracts,
  partnerPayments,
  orderUnits,
  partnerTasks,
  requestItems,
  requests,
  requestTypes,
  signatureRequests,
} from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { logActivity } from "@/lib/utils/activity"
import { notify } from "@/lib/utils/notify"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
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
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { assetStatusAfter, canAssetTransition, type AssetStatus } from "@/lib/domain/asset-status"
import { recordAssetEvent } from "@/lib/actions/assets"
import { isValidActiveFailureReason } from "@/lib/actions/failure-reasons"
import {
  getRequiredDeliveryPhotoCount,
  getTaskTokenTtlMs,
  isProofEnforcementEnabled,
  getSystemDefaultProof,
} from "@/lib/actions/settings"
import { parseProofConfig, resolveProofRequirements } from "@/lib/domain/proof"

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
    executionMode?: "manual" | "api_courier"
    notes?: string
  }
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createTaskSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + (await getTaskTokenTtlMs())

  const id = createId()
  await db.insert(partnerTasks).values({
    id,
    requestId,
    partnerId: data.partnerId,
    contractId: data.contractId || null,
    contactId: data.contactId || null,
    taskTypeId: data.taskTypeId || null,
    executionMode: data.executionMode ?? "manual",
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

  // Notify the partner in-app when they have a portal login linked.
  try {
    const [partner] = await db
      .select({ userId: partners.userId })
      .from(partners)
      .where(eq(partners.id, data.partnerId))
    const [request] = await db
      .select({ requestNumber: requests.requestNumber })
      .from(requests)
      .where(eq(requests.id, requestId))

    if (partner?.userId) {
      await notify({
        userId: partner.userId,
        type: "task_assigned",
        i18nKey: "notifications.taskAssigned",
        i18nData: { requestNumber: request?.requestNumber ?? "" },
        linkUrl: `/task/${taskToken}`,
        entityType: "partner_task",
        entityId: id,
      })
    }
  } catch (error) {
    console.error("tasks: swallowed fallback error", error)
    // Notification failures must not block task assignment.
  }

  await syncRequestStatus(requestId)
  revalidatePath(`/admin/requests/${requestId}`)
  return { id, taskToken }
}

// ─── Admin: get tasks for a request ──────────────────────────────────────────

export async function getTasksForRequest(requestId: string) {
  const session = await getStaffSession()
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
      partnerMobile: partners.mobile,
      executionMode: partnerTasks.executionMode,
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
  quantity?: number,
  noPaymentReason?: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }

  // Admins can override a failed task straight to closed (partner actually
  // delivered but marked it failed by mistake) instead of only accepting
  // sign-off from the normal pending_signoff state
  const isOverride = task.status === "failed"
  if (task.status !== "pending_signoff" && !isOverride) {
    return { error: "Task is not awaiting sign-off" }
  }

  // Never generate payment for work under a cancelled/deleted request. A
  // failed request is allowed through when this is itself the override that
  // rescues the request out of that failed state.
  const [parentRequest] = await db.select().from(requests).where(eq(requests.id, task.requestId))
  if (!parentRequest || parentRequest.deletedAt) return { error: "Request no longer exists" }
  if (parentRequest.status === "cancelled" || (parentRequest.status === "failed" && !isOverride)) {
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

  // OI-0 proof gate: when enforcement is enabled, a task whose resolved proof
  // requirements include a customer signature cannot be closed until a signed
  // signature request exists for it (or its parent request). Overrides — an
  // admin rescuing a mistakenly-failed task — bypass the gate. Enforcement is
  // OFF by default so operators can author proof config before it blocks.
  if (!isOverride && (await isProofEnforcementEnabled())) {
    const systemDefault = await getSystemDefaultProof()
    const [reqTypeRow] = await db
      .select({ proofConfig: requestTypes.proofConfig })
      .from(requestTypes)
      .where(eq(requestTypes.id, parentRequest.typeId))
    const proof = resolveProofRequirements(
      [parseProofConfig(reqTypeRow?.proofConfig)],
      {},
      systemDefault
    )
    if (proof.signature) {
      const [signed] = await db
        .select({ id: signatureRequests.id })
        .from(signatureRequests)
        .where(
          and(
            eq(signatureRequests.status, "signed"),
            or(
              eq(signatureRequests.partnerTaskId, taskId),
              eq(signatureRequests.requestId, task.requestId)
            )
          )
        )
      if (!signed) {
        return {
          error: "A signed customer signature is required before this task can be closed",
        }
      }
    }
  }

  try {
  await db.transaction(async (tx) => {
    // Guard the write on the status we validated above — a concurrent sign-off
    // (double-tap, two admins) on the same task would otherwise both pass
    // validation against a stale read and both insert a payment record.
    const result = await tx
      .update(partnerTasks)
      .set({
        status: "closed",
        signoffQuantity: quantity ?? null,
        closedBy: session.user.id,
        closedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.status, task.status)))

    const changed = (result as { rowsAffected?: number }).rowsAffected ?? 1
    if (changed === 0) throw new Error("TASK_STATUS_CHANGED")

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
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_STATUS_CHANGED") {
      return { error: "Task status changed since you loaded this page. Please refresh and retry." }
    }
    throw error
  }

  // Move the request's pulled devices through the asset lifecycle:
  // delivery-type sign-off -> delivered (with customer); collection-type ->
  // returned (back for inspection). Best-effort: asset sync must never block
  // the sign-off itself.
  try {
    const [reqType] = await db
      .select({ slug: requestTypes.slug })
      .from(requestTypes)
      .where(eq(requestTypes.id, parentRequest.typeId))
    const slug = reqType?.slug
    const assetAction =
      slug === "collection" ? ("return" as const)
      : slug === "delivery" || slug === "installation" || slug === "swap" ? ("deliver" as const)
      : null

    if (assetAction) {
      const pulled = await db
        .select({ orderUnitId: requestItems.orderUnitId })
        .from(requestItems)
        .where(and(eq(requestItems.requestId, task.requestId), isNotNull(requestItems.orderUnitId)))
      const unitIds = pulled.map((r) => r.orderUnitId).filter((v): v is string => Boolean(v))

      for (const unitId of unitIds) {
        const [unit] = await db.select().from(orderUnits).where(eq(orderUnits.id, unitId))
        if (!unit || !canAssetTransition(unit.status as AssetStatus, assetAction)) continue
        const to = assetStatusAfter(assetAction)
        await db
          .update(orderUnits)
          .set({
            status: to,
            updatedAt: Date.now(),
            ...(assetAction === "return"
              ? { currentRequestId: null, currentCustomerId: null }
              : {}),
          })
          .where(eq(orderUnits.id, unitId))
        await recordAssetEvent({
          assetId: unitId,
          type: assetAction === "return" ? "returned" : "delivered",
          fromStatus: unit.status,
          toStatus: to,
          requestId: task.requestId,
          customerId: parentRequest.customerId,
          byUserId: session.user.id,
        })
      }
    }
  } catch (error) {
    console.error("asset sync on signOffTask failed", error)
  }

  await logActivity({
    entityType: "request",
    entityId: task.requestId,
    action: isOverride ? "task_force_completed" : "task_signed_off",
    i18nKey: isOverride ? "activity.taskForceCompleted" : "activity.taskSignedOff",
    performedBy: session.user.id,
  })

  // OI-0: a task closed with no contract produces no partner payment. Record why,
  // so a zero-payment close is an explicit, audited decision rather than silent.
  if (!contract) {
    await logActivity({
      entityType: "request",
      entityId: task.requestId,
      action: "task_closed_no_payment",
      i18nKey: "activity.taskClosedNoPayment",
      i18nData: { reason: noPaymentReason ?? "no_contract" },
      performedBy: session.user.id,
    })
  }

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
  const taskTokenExpiresAt = Date.now() + (await getTaskTokenTtlMs())

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
  if (!checkRateLimit(`task-update:${token}`, 20)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
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
    if (!(await isValidActiveFailureReason(data.failureReason))) {
      return { error: "Invalid failure reason" }
    }
  }

  const newStatus = ACTION_STATUS[action]
  if (!canTransition(task.status, action)) {
    return { error: "Invalid action for current task status" }
  }

  // Proof-of-delivery: require at least the admin-configured photo count
  // before a partner can mark a delivery done. Failures are exempt (photo
  // may be impossible on-site).
  if (newStatus === "pending_signoff") {
    const requiredPhotos = await getRequiredDeliveryPhotoCount()
    if (requiredPhotos > 0) {
      const [{ value: photoCount }] = await db
        .select({ value: count() })
        .from(attachments)
        .where(and(eq(attachments.entityId, task.id), eq(attachments.entityType, "partner_task")))
      if (photoCount < requiredPhotos) {
        return { error: "PHOTO_REQUIRED" }
      }
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

  // Guard on the status we validated above — a double-tap or two tabs racing
  // the same magic link would otherwise both pass canTransition and both write.
  const updateResult = await db
    .update(partnerTasks)
    .set(updates)
    .where(and(eq(partnerTasks.taskToken, token), eq(partnerTasks.status, task.status)))
  const rowsChanged = (updateResult as { rowsAffected?: number }).rowsAffected ?? 1
  if (rowsChanged === 0) {
    return { error: "Task status changed. Please refresh and try again." }
  }

  await logActivity({
    entityType: "request",
    entityId: task.requestId,
    action: `task_${action}`,
    i18nKey: `activity.task_${action}`,
    performedAs: "partner_link",
  })

  await syncRequestStatus(task.requestId)
  revalidatePath(`/task/${token}`)
  return { id: task.id }
}

// ─── Admin: get all active contracts by partner (for assign form) ─────────────

export async function getPartnersWithContracts() {
  const session = await getStaffSession()
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

  // FK pragma is off in this project (see orders.ts), so a hard-delete here
  // would silently orphan attachment rows/photos and notification rows that
  // reference this task — clean them up in the same transaction.
  await db.transaction(async (tx) => {
    await tx
      .delete(attachments)
      .where(and(eq(attachments.entityId, taskId), eq(attachments.entityType, "partner_task")))
    await tx
      .delete(notifications)
      .where(and(eq(notifications.entityId, taskId), eq(notifications.entityType, "partner_task")))
    await tx.delete(partnerTasks).where(eq(partnerTasks.id, taskId))
  })

  revalidatePath(`/admin/requests/${task.requestId}`)
  return {}
}
