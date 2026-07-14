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
  partnerTasks,
  pickupTaskLines,
  requestItems,
  requests,
  requestTypes,
  signatureRequests,
  customerSignatures,
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
import { canSignOff } from "@/lib/domain/delivery-signoff"
import { computePayment, requiresQuantity, type PricingModel } from "@/lib/domain/pricing"
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"
import { isValidActiveFailureReason } from "@/lib/actions/failure-reasons"
import {
  getRequiredDeliveryPhotoCount,
  getTaskTokenTtlMs,
  isProofEnforcementEnabled,
  getSystemDefaultProof,
} from "@/lib/actions/settings"
import { parseProofConfig, resolveProofRequirements } from "@/lib/domain/proof"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { domainEventTypeForTaskAction } from "@/lib/domain/domain-events"

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
    await db.transaction(async (tx) => {
      const result = await tx
        .update(requests)
        .set({ status: newStatus as typeof request.status, updatedAt: Date.now() })
        .where(and(eq(requests.id, requestId), eq(requests.status, request.status)))
      const changed = (result as { rowsAffected?: number }).rowsAffected ?? 1
      if (changed === 0) return // status already moved concurrently — skip event, nothing to report

      await logActivity(
        {
          entityType: "request",
          entityId: requestId,
          action: "status_changed",
          i18nKey: "activity.statusChanged",
          i18nData: { status: newStatus },
          performedAs: "system",
        },
        tx
      )

      const domainEventType = newStatus === "assigned" ? "RequestAssigned" : newStatus === "completed" ? "RequestCompleted" : null
      if (domainEventType) {
        await emitDomainEvent(tx, {
          aggregateType: "request",
          aggregateId: requestId,
          eventType: domainEventType,
          payload: { fromStatus: request.status, toStatus: newStatus },
          dedupeKey: `request:${requestId}:${domainEventType}:${createId()}`,
        })
      }
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
    photoRequired?: boolean
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
    photoRequired: data.photoRequired ?? true,
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

  // Supplier-pickup tasks NEVER close through admin sign-off — completion
  // happens only via warehouse receipt (receivePurchaseOrderLineCore).
  if (task.kind === "supplier_pickup" || !task.requestId) {
    return { error: "Pickup tasks are closed by warehouse receipt, not sign-off" }
  }
  const taskRequestId = task.requestId

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
  const [parentRequest] = await db.select().from(requests).where(eq(requests.id, taskRequestId))
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

  // Payment gate: "admin-approved proof that physical delivery occurred".
  //
  // requiresSignature — only when proof enforcement is enabled AND the resolved
  // proof config for this request type includes a signature. Enforcement is OFF
  // by default so operators can author proof config before it blocks.
  //
  // Accepted proof = a "signed" signature request for this task/request (on-site
  // receiver signature, remote e-signature, or an approved manual upload — all
  // land as status "signed"). A refused delivery lands as "rejected" and fails
  // the task instead. Authorised stage-2 sign-off is documentation-only and is
  // NOT consulted here, so a pending stage-2 never blocks payment.
  let requiresSignature = false
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
    requiresSignature = proof.signature
  }

  const [proofRow] = await db
    .select({ outcome: customerSignatures.deliveryOutcome })
    .from(customerSignatures)
    .innerJoin(signatureRequests, eq(customerSignatures.signatureRequestId, signatureRequests.id))
    .where(
      and(
        eq(signatureRequests.status, "signed"),
        or(
          eq(signatureRequests.partnerTaskId, taskId),
          eq(signatureRequests.requestId, taskRequestId)
        )
      )
    )
    .orderBy(desc(customerSignatures.signedAt))
    .limit(1)

  const decision = canSignOff({
    isOverride,
    requiresSignature,
    hasAcceptedProof: !!proofRow,
    latestSignedOutcome: proofRow?.outcome ?? null,
  })
  if (!decision.ok) {
    return {
      error:
        decision.reason === "signature_required"
          ? "A signed customer signature is required before this task can be closed"
          : decision.reason === "partial_unresolved"
            ? "Partial delivery — resolve the outstanding items before sign-off"
            : "Delivery was refused — cannot sign off; use the failed / reschedule workflow",
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

    await emitDomainEvent(tx, {
      aggregateType: "task",
      aggregateId: taskId,
      eventType: "TaskClosed",
      payload: { requestId: taskRequestId, isOverride, quantity: quantity ?? null },
      dedupeKey: `task:${taskId}:TaskClosed`,
      actorUserId: session.user.id,
    })

    // Auto-create partner_payment when task has a contract
    if (contract) {
      const { quantity: finalQty, totalAmount } = computePayment(
        contract.pricingModel as PricingModel,
        contract.unitPrice,
        quantity
      )

      const paymentId = createId()
      await tx.insert(partnerPayments).values({
        id: paymentId,
        partnerId: task.partnerId,
        partnerTaskId: task.id,
        pricingModel: contract.pricingModel,
        quantity: finalQty,
        unitPrice: contract.unitPrice,
        totalAmount,
        status: "pending",
      })

      await emitDomainEvent(tx, {
        aggregateType: "partner_payment",
        aggregateId: paymentId,
        eventType: "PartnerPaymentCreated",
        payload: { partnerId: task.partnerId, partnerTaskId: task.id, totalAmount },
        dedupeKey: `partner_payment:${paymentId}:PartnerPaymentCreated`,
        actorUserId: session.user.id,
      })
    }

    // OI-1: move the request's pulled devices through the asset lifecycle in
    // the SAME transaction as the task close — delivery-type sign-off ->
    // delivered (with customer); collection-type -> returned (back for
    // inspection). Previously this ran best-effort AFTER the tx committed, so
    // a crash between the two could close a task with no matching asset
    // movement, or write an asset_event with no corresponding status change.
    // A unit already in an unexpected status (e.g. an earlier manual
    // override) is skipped, not fatal — it must not block the sign-off itself.
    const [reqType] = await tx
      .select({ slug: requestTypes.slug })
      .from(requestTypes)
      .where(eq(requestTypes.id, parentRequest.typeId))
    const slug = reqType?.slug
    const assetAction =
      slug === "collection" ? ("return" as const)
      : slug === "delivery" || slug === "installation" || slug === "swap" ? ("deliver" as const)
      : null

    if (assetAction) {
      const pulled = await tx
        .select({ orderUnitId: requestItems.orderUnitId })
        .from(requestItems)
        .where(and(eq(requestItems.requestId, taskRequestId), isNotNull(requestItems.orderUnitId)))
      const unitIds = pulled.map((r) => r.orderUnitId).filter((v): v is string => Boolean(v))

      for (const unitId of unitIds) {
        try {
          await applyAssetTransition(tx, unitId, assetAction, {
            requestId: taskRequestId,
            customerId: parentRequest.customerId,
            byUserId: session.user.id,
          })
        } catch (error) {
          if (!(error instanceof AssetTransitionError)) throw error
          // NOT_FOUND / INVALID_TRANSITION: unit isn't in the expected state
          // for this action (e.g. already moved by an earlier override) —
          // skip it rather than fail the whole sign-off.
        }
      }
    }
  })
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_STATUS_CHANGED") {
      return { error: "Task status changed since you loaded this page. Please refresh and retry." }
    }
    throw error
  }

  await logActivity({
    entityType: "request",
    entityId: taskRequestId,
    action: isOverride ? "task_force_completed" : "task_signed_off",
    i18nKey: isOverride ? "activity.taskForceCompleted" : "activity.taskSignedOff",
    performedBy: session.user.id,
  })

  // OI-0: a task closed with no contract produces no partner payment. Record why,
  // so a zero-payment close is an explicit, audited decision rather than silent.
  if (!contract) {
    await logActivity({
      entityType: "request",
      entityId: taskRequestId,
      action: "task_closed_no_payment",
      i18nKey: "activity.taskClosedNoPayment",
      i18nData: { reason: noPaymentReason ?? "no_contract" },
      performedBy: session.user.id,
    })
  }

  await syncRequestStatus(taskRequestId)
  revalidatePath(`/admin/requests/${taskRequestId}`)
  return { id: taskId }
}

// ─── Admin: reject proof (return task to partner) ────────────────────────────
// Reviewer path for pending_signoff: instead of closing, send the task back to
// in_progress so the partner can redo the delivery proof. Photos are kept for
// audit; the partner can add more before marking done again.

export async function rejectTaskProof(taskId: string, reason?: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  if (reason && reason.length > 500) return { error: "Reason is too long" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }
  if (task.kind === "supplier_pickup" || !task.requestId) {
    return { error: "Pickup tasks have no sign-off proof to reject" }
  }
  const taskRequestId = task.requestId
  if (task.status !== "pending_signoff") {
    return { error: "Task is not awaiting sign-off" }
  }

  // The partner needs a working magic link to redo the proof — extend it if
  // it expired while the task sat in review.
  const tokenUpdate =
    task.taskTokenExpiresAt < Date.now()
      ? { taskTokenExpiresAt: Date.now() + (await getTaskTokenTtlMs()) }
      : {}

  let rowsChanged = 0
  await db.transaction(async (tx) => {
    // Guard on pending_signoff so a concurrent sign-off and a reject can't
    // both win — whichever commits first invalidates the other.
    const result = await tx
      .update(partnerTasks)
      .set({
        status: "in_progress",
        completedAt: null,
        updatedAt: Date.now(),
        ...tokenUpdate,
      })
      .where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.status, "pending_signoff")))
    rowsChanged = (result as { rowsAffected?: number }).rowsAffected ?? 1
    if (rowsChanged === 0) return

    await logActivity(
      {
        entityType: "request",
        entityId: taskRequestId,
        action: "task_proof_rejected",
        i18nKey: "activity.taskProofRejected",
        i18nData: reason ? { reason } : undefined,
        performedBy: session.user.id,
      },
      tx
    )

    await emitDomainEvent(tx, {
      aggregateType: "task",
      aggregateId: taskId,
      eventType: "TaskProofRejected",
      payload: { requestId: taskRequestId, reason: reason ?? null },
      dedupeKey: `task:${taskId}:TaskProofRejected:${createId()}`,
      actorUserId: session.user.id,
    })
  })
  if (rowsChanged === 0) {
    return { error: "Task status changed since you loaded this page. Please refresh and retry." }
  }

  // Notify the partner in-app when they have a portal login linked.
  try {
    const [partner] = await db
      .select({ userId: partners.userId })
      .from(partners)
      .where(eq(partners.id, task.partnerId))
    const [request] = await db
      .select({ requestNumber: requests.requestNumber })
      .from(requests)
      .where(eq(requests.id, taskRequestId))

    if (partner?.userId) {
      await notify({
        userId: partner.userId,
        type: "task_proof_rejected",
        i18nKey: "notifications.taskProofRejected",
        i18nData: { requestNumber: request?.requestNumber ?? "" },
        linkUrl: `/task/${task.taskToken}`,
        entityType: "partner_task",
        entityId: taskId,
      })
    }
  } catch (error) {
    console.error("tasks: swallowed fallback error", error)
    // Notification failures must not block the rejection itself.
  }

  await syncRequestStatus(taskRequestId)
  revalidatePath(`/admin/requests/${taskRequestId}`)
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
  // After pickup the goods physically sit with the partner — the task must be
  // resolved by warehouse receipt (or admin failure handling), never vanish.
  if (task.kind === "supplier_pickup" && task.status === "picked_up") {
    return { error: "Cannot cancel a pickup that already collected goods — receive or fail it" }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(partnerTasks)
      .set({ status: "cancelled", taskTokenExpiresAt: Date.now(), updatedAt: Date.now() })
      .where(eq(partnerTasks.id, taskId))

    await logActivity(
      {
        entityType: task.requestId ? "request" : "purchase_order",
        entityId: task.requestId ?? task.purchaseOrderId ?? task.id,
        action: "task_cancelled",
        i18nKey: "activity.taskCancelled",
        performedBy: session.user.id,
      },
      tx
    )

    await emitDomainEvent(tx, {
      aggregateType: "task",
      aggregateId: taskId,
      eventType: "TaskCancelled",
      payload: { fromStatus: task.status, toStatus: "cancelled" },
      dedupeKey: `task:${taskId}:TaskCancelled`,
      actorUserId: session.user.id,
    })
  })

  if (task.requestId) {
    await syncRequestStatus(task.requestId)
    revalidatePath(`/admin/requests/${task.requestId}`)
  } else if (task.purchaseOrderId) {
    revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
  }
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
    entityType: task.requestId ? "request" : "purchase_order",
    entityId: task.requestId ?? task.purchaseOrderId ?? task.id,
    action: "task_link_regenerated",
    i18nKey: "activity.taskLinkRegenerated",
    performedBy: session.user.id,
  })

  if (task.requestId) revalidatePath(`/admin/requests/${task.requestId}`)
  else if (task.purchaseOrderId) revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
  return { id: taskId, taskToken }
}

// ─── Public: get task by token ────────────────────────────────────────────────

export async function getTaskByToken(token: string) {
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, token))

  if (!task) return null

  // Supplier-pickup tasks have no request/customer — the partner page shows
  // supplier pickup info + expected PO lines instead (getPickupTaskByToken in
  // lib/actions/procurement-pickup.ts). Signal the kind so the route branches.
  if (task.kind === "supplier_pickup" || !task.requestId) {
    return { task, request: null, partner: null, customer: null, items: [], requestType: null, linkedContact: null, isExpired: task.taskTokenExpiresAt < Date.now() }
  }
  const taskRequestId = task.requestId

  const [[request], [partner], items] = await Promise.all([
    db.select().from(requests).where(eq(requests.id, taskRequestId)),
    db.select().from(partners).where(eq(partners.id, task.partnerId)),
    db.select().from(requestItems).where(eq(requestItems.requestId, taskRequestId)),
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

// Token-scoped: the caller proves ownership by holding the task's magic-link
// token, never by passing a raw taskId (which would be an IDOR — any id could
// be enumerated to read another partner's delivery photos).
export async function getTaskPhotosByToken(token: string) {
  const [task] = await db
    .select({ id: partnerTasks.id })
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, token))

  if (!task) return []

  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityId, task.id), eq(attachments.entityType, "partner_task")))
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

  // Pickup collection is quantity-carrying: it must go through
  // markPickupCollectedByToken (procurement-pickup.ts), never this generic path.
  if (action === "mark_picked_up") return { error: "Invalid action" }

  const newStatus = ACTION_STATUS[action]
  if (!canTransition(task.status, action, task.kind)) {
    return { error: "Invalid action for current task status" }
  }

  // Proof-of-delivery: require at least the admin-configured photo count
  // before a partner can mark a delivery done. Failures are exempt (photo
  // may be impossible on-site). Skipped entirely when the admin marked this
  // task's photo as not required (task.photoRequired = false).
  if (newStatus === "pending_signoff" && task.photoRequired) {
    const requiredPhotos = Math.max(1, await getRequiredDeliveryPhotoCount())
    const [{ value: photoCount }] = await db
      .select({ value: count() })
      .from(attachments)
      .where(and(eq(attachments.entityId, task.id), eq(attachments.entityType, "partner_task")))
    if (photoCount < requiredPhotos) {
      return { error: "PHOTO_REQUIRED" }
    }
  }

  const updates: Partial<typeof partnerTasks.$inferInsert> = {
    status: newStatus as typeof task.status,
    updatedAt: Date.now(),
  }

  if (newStatus === "accepted") updates.acceptedAt = Date.now()
  if (newStatus === "pending_signoff") {
    updates.completedAt = Date.now()
    // Physical handover happened. Signature (proof) is tracked separately in
    // signatureReceivedAt and may arrive later (remote / manual return).
    updates.deliveredAt = Date.now()
  }
  if (newStatus === "arrived") updates.arrivedAt = Date.now()
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
  let rowsChanged = 0
  await db.transaction(async (tx) => {
    const updateResult = await tx
      .update(partnerTasks)
      .set(updates)
      .where(and(eq(partnerTasks.taskToken, token), eq(partnerTasks.status, task.status)))
    rowsChanged = (updateResult as { rowsAffected?: number }).rowsAffected ?? 1
    if (rowsChanged === 0) return

    await logActivity(
      {
        entityType: task.requestId ? "request" : "purchase_order",
        entityId: task.requestId ?? task.purchaseOrderId ?? task.id,
        action: `task_${action}`,
        i18nKey: `activity.task_${action}`,
        performedAs: "partner_link",
      },
      tx
    )

    const domainEventType = domainEventTypeForTaskAction(action)
    if (domainEventType) {
      await emitDomainEvent(tx, {
        aggregateType: "task",
        aggregateId: task.id,
        eventType: domainEventType,
        payload: { fromStatus: task.status, toStatus: newStatus },
        dedupeKey: `task:${task.id}:${domainEventType}:${createId()}`,
      })
    }
  })
  if (rowsChanged === 0) {
    return { error: "Task status changed. Please refresh and try again." }
  }

  if (task.requestId) await syncRequestStatus(task.requestId)
  if (task.purchaseOrderId) revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
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
    .select({
      requestId: partnerTasks.requestId,
      purchaseOrderId: partnerTasks.purchaseOrderId,
      kind: partnerTasks.kind,
      status: partnerTasks.status,
    })
    .from(partnerTasks)
    .where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Not found" }
  // Closed tasks have payment records referencing them — deleting would orphan the payment
  if (task.status === "closed") return { error: "Closed tasks cannot be deleted" }
  // A pickup that collected goods carries in-transit quantities on PO lines —
  // deleting it would orphan those counters. Resolve via receipt/failure instead.
  if (task.kind === "supplier_pickup" && task.status === "picked_up") {
    return { error: "Cannot delete a pickup that already collected goods" }
  }

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
    await tx
      .delete(pickupTaskLines)
      .where(eq(pickupTaskLines.pickupTaskId, taskId))
    await tx.delete(partnerTasks).where(eq(partnerTasks.id, taskId))
  })

  if (task.requestId) revalidatePath(`/admin/requests/${task.requestId}`)
  else if (task.purchaseOrderId) revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
  return {}
}
