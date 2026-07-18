"use server"

import { and, count, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  attachments,
  customerContacts,
  customers,
  deliveryTaskItems,
  notifications,
  orderUnits,
  partners,
  partnerContracts,
  partnerPaymentDecisions,
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
import { resolveTaskContactId } from "@/lib/domain/task-contact"

export type ActionResult = { error?: string; id?: string; taskToken?: string }

// ─── Auto request status sync ─────────────────────────────────────────────────
// Pure derivation lives in lib/domain/request-status.ts (unit-tested); this
// wrapper handles the DB read/write around it.

// Delivery Batching v2: partner_task.requestId is legacy/advisory only (null
// on tasks that span multiple requests) — delivery_task_item is the source of
// truth for which requests a task actually touches, so status sync (and any
// other request-scoped read) derives task membership through it instead of
// trusting the task's own requestId column.
export async function syncRequestStatus(requestId: string) {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!request) return

  // Two signals, merged: the legacy requestId column (still the only pointer
  // for tasks created without going through allocateTaskItem, e.g. older
  // fixtures/tests) OR delivery_task_item membership (the real source of
  // truth for batched tasks, where requestId is null). Neither alone is
  // reliable on its own.
  const [byColumn, byItems] = await Promise.all([
    db
      .select({ id: partnerTasks.id, status: partnerTasks.status })
      .from(partnerTasks)
      .where(eq(partnerTasks.requestId, requestId)),
    db
      .selectDistinct({ id: partnerTasks.id, status: partnerTasks.status })
      .from(partnerTasks)
      .innerJoin(deliveryTaskItems, eq(deliveryTaskItems.partnerTaskId, partnerTasks.id))
      .innerJoin(requestItems, eq(requestItems.id, deliveryTaskItems.requestItemId))
      .where(eq(requestItems.requestId, requestId)),
  ])
  const tasks = [...new Map([...byColumn, ...byItems].map((t) => [t.id, t])).values()]

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

// Distinct requests a task actually touches — merges delivery_task_item
// membership (the real source of truth for batched tasks) with the task's own
// legacy requestId column (still the only pointer for tasks created without
// going through allocateTaskItem, e.g. older fixtures/tests). The one place
// every request-status-affecting task transition should read from.
export async function getAffectedRequestIds(taskId: string): Promise<string[]> {
  const [byItems, [task]] = await Promise.all([
    db
      .selectDistinct({ requestId: requestItems.requestId })
      .from(deliveryTaskItems)
      .innerJoin(requestItems, eq(requestItems.id, deliveryTaskItems.requestItemId))
      .where(eq(deliveryTaskItems.partnerTaskId, taskId)),
    db.select({ requestId: partnerTasks.requestId }).from(partnerTasks).where(eq(partnerTasks.id, taskId)),
  ])
  const ids = new Set(byItems.map((r) => r.requestId))
  if (task?.requestId) ids.add(task.requestId)
  return [...ids]
}

// Delivery Batching v2 P5: request/customer summary for every request a task
// touches, used to build ONE WhatsApp message covering the whole trip instead
// of one message per request. Returns null for a plain single-request task —
// callers should fall back to the existing single-requestNumber wording.
export async function getBatchSummaryForTask(
  taskId: string
): Promise<{ requestNumber: string; customerName: string | null }[] | null> {
  const affectedRequestIds = await getAffectedRequestIds(taskId)
  if (affectedRequestIds.length <= 1) return null

  const rows = await db
    .select({ requestNumber: requests.requestNumber, customerName: customers.name })
    .from(requests)
    .leftJoin(customers, eq(customers.id, requests.customerId))
    .where(inArray(requests.id, affectedRequestIds))

  return rows
}

// ─── Delivery-task-item allocation ────────────────────────────────────────────
// Guarded, atomic per-item allocation (mirrors the pickup_task_line / CAS
// pattern already used for purchase_order_line quantities). The remaining-
// quantity computation and the INSERT happen in a single statement — SQLite's
// single-writer model serializes this, so two concurrent allocations can never
// both succeed against the same over-committed remaining quantity. Terminal
// tasks (closed/cancelled/rejected/failed) are excluded from the open-
// allocation sum, so cancelling a task immediately releases its reservation
// with no separate release step.
const OPEN_TASK_STATUSES = sql`('closed','cancelled','rejected','failed')`

export async function allocateTaskItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  taskId: string,
  requestItemId: string,
  qty: number
): Promise<boolean> {
  if (qty <= 0) return false
  const id = createId()
  const now = Date.now()
  const result = await tx.run(sql`
    INSERT INTO delivery_task_item (id, partner_task_id, request_item_id, qty_planned, created_at, updated_at)
    SELECT ${id}, ${taskId}, ${requestItemId}, ${qty}, ${now}, ${now}
    WHERE (
      SELECT ri.quantity - ri.delivered_quantity - COALESCE((
        SELECT SUM(dti.qty_planned) FROM delivery_task_item dti
        JOIN partner_task pt ON pt.id = dti.partner_task_id
        WHERE dti.request_item_id = ${requestItemId} AND pt.status NOT IN ${OPEN_TASK_STATUSES}
      ), 0)
      FROM request_item ri WHERE ri.id = ${requestItemId}
    ) >= ${qty}
  `)
  const changed = (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
  return changed > 0
}

// Read-only: remaining = ordered − admin-approved delivered − open-allocation sum.
async function getRemainingQuantities(requestId: string) {
  const items = await db.select().from(requestItems).where(eq(requestItems.requestId, requestId))
  const rows = await Promise.all(
    items.map(async (item) => {
      const result = await db.run(sql`
        SELECT COALESCE(SUM(dti.qty_planned), 0) AS allocated FROM delivery_task_item dti
        JOIN partner_task pt ON pt.id = dti.partner_task_id
        WHERE dti.request_item_id = ${item.id} AND pt.status NOT IN ${OPEN_TASK_STATUSES}
      `)
      const allocated = Number((result.rows[0] as unknown as { allocated: number } | undefined)?.allocated ?? 0)
      return {
        requestItemId: item.id,
        description: item.description,
        quantity: item.quantity,
        deliveredQuantity: item.deliveredQuantity,
        remaining: Math.max(0, item.quantity - item.deliveredQuantity - allocated),
      }
    })
  )
  return rows
}

export async function getRemainingQuantitiesForRequest(requestId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return getRemainingQuantities(requestId)
}

// ─── Admin: create task ───────────────────────────────────────────────────────

export type CreateTaskData = {
  partnerId: string
  contractId?: string
  contactId?: string
  taskTypeId?: string
  executionMode?: "manual" | "api_courier"
  photoRequired?: boolean
  notes?: string
  // Explicit per-item allocation (used by createFollowUpDeliveryTask). When
  // omitted, the task claims all currently-remaining quantity on every item —
  // the common single-task-per-request case, unchanged from before this
  // allocation layer existed.
  items?: { requestItemId: string; qty: number }[]
}

async function createTaskCore(
  requestId: string,
  data: CreateTaskData,
  actorUserId: string
): Promise<ActionResult> {
  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + (await getTaskTokenTtlMs())
  const id = createId()

  try {
    await db.transaction(async (tx) => {
      const [requestContact] = await tx
        .select({ receiverContactId: requests.receiverContactId })
        .from(requests)
        .where(eq(requests.id, requestId))

      await tx.insert(partnerTasks).values({
        id,
        requestId,
        partnerId: data.partnerId,
        contractId: data.contractId || null,
        contactId: resolveTaskContactId(data.contactId, requestContact?.receiverContactId ?? null),
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

      if (data.items) {
        for (const item of data.items) {
          if (item.qty <= 0) continue
          const ok = await allocateTaskItem(tx, id, item.requestItemId, item.qty)
          if (!ok) throw new Error("ALLOCATION_FAILED")
        }
      } else {
        const remaining = await getRemainingQuantities(requestId)
        if (remaining.length > 0 && remaining.every((r) => r.remaining <= 0)) {
          // Nothing left to allocate — a second plain createTask on an
          // already-fully-allocated request is almost certainly a mistake;
          // use createFollowUpDeliveryTask with explicit items instead.
          throw new Error("ALLOCATION_FAILED")
        }
        for (const r of remaining) {
          if (r.remaining <= 0) continue
          const ok = await allocateTaskItem(tx, id, r.requestItemId, r.remaining)
          if (!ok) throw new Error("ALLOCATION_FAILED")
        }
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "ALLOCATION_FAILED") {
      return { error: "Not enough remaining quantity to allocate — another task may have claimed it. Refresh and retry." }
    }
    throw error
  }

  return { id, taskToken }
}

export async function createTask(
  requestId: string,
  data: CreateTaskData
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createTaskSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const created = await createTaskCore(requestId, data, session.user.id)
  if (created.error) return created
  const { id, taskToken } = created

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

// ─── Admin: create follow-up delivery (remaining quantities) ─────────────────
// Never reuses a prior task's OTP/signature/proof — this is a brand-new task
// with its own token/lifecycle. Partner/contract may be the same or different;
// the caller must pass an explicit contractId belonging to the chosen partner
// (never silently inherited) — validated below.

export async function createFollowUpDeliveryTask(
  requestId: string,
  data: {
    partnerId: string
    contractId?: string
    contactId?: string
    taskTypeId?: string
    executionMode?: "manual" | "api_courier"
    photoRequired?: boolean
    notes?: string
    items: { requestItemId: string; qty: number }[]
  }
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createTaskSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  if (!data.items.length || data.items.every((i) => i.qty <= 0)) {
    return { error: "Select at least one item with a quantity to allocate" }
  }

  // A request item can only be allocated on this request — reject cross-request ids.
  const requestItemRows = await db
    .select({ id: requestItems.id })
    .from(requestItems)
    .where(eq(requestItems.requestId, requestId))
  const validIds = new Set(requestItemRows.map((r) => r.id))
  if (data.items.some((i) => !validIds.has(i.requestItemId))) {
    return { error: "One or more items do not belong to this request" }
  }

  // Contract must belong to the chosen partner — never let Partner A's
  // contract remain selected for Partner B.
  if (data.contractId) {
    const [contract] = await db
      .select()
      .from(partnerContracts)
      .where(eq(partnerContracts.id, data.contractId))
    if (!contract || contract.partnerId !== data.partnerId) {
      return { error: "Selected contract does not belong to the selected partner" }
    }
    if (contract.status !== "active") {
      return { error: "Selected contract is not active" }
    }
  }

  const created = await createTaskCore(requestId, data, session.user.id)
  if (created.error) return created
  const { id, taskToken } = created

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

// ─── Admin: partial-delivery resolution (minimum slice) ──────────────────────
// After a partial/refused/unavailable delivery, admin picks how the request
// itself resolves. This is independent of task close/payment (already
// admin-decided via signOffTask) — it only sets the customer-request status.

export async function resolveRequestAfterPartialDelivery(
  requestId: string,
  resolution: "on_hold" | "rescheduled" | "cancelled" | "failed"
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [req] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!req || req.deletedAt) return { error: "Request not found" }

  await db
    .update(requests)
    .set({ status: resolution, updatedAt: Date.now() })
    .where(eq(requests.id, requestId))

  await logActivity({
    entityType: "request",
    entityId: requestId,
    action: "status_changed",
    i18nKey: "activity.statusChanged",
    i18nData: { status: resolution },
    performedBy: session.user.id,
  })

  revalidatePath(`/admin/requests/${requestId}`)
  return { id: requestId }
}

// Admin explicitly accepts partial delivery as final — waives remaining
// quantity (no further follow-up expected) and completes the request.
export async function acceptPartialDeliveryAsFinal(
  requestId: string,
  reason: string
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!reason.trim()) return { error: "A reason is required to accept partial delivery as final" }

  const [req] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!req || req.deletedAt) return { error: "Request not found" }

  await db
    .update(requests)
    .set({ status: "completed", updatedAt: Date.now() })
    .where(eq(requests.id, requestId))

  await logActivity({
    entityType: "request",
    entityId: requestId,
    action: "status_changed",
    i18nKey: "activity.statusChanged",
    i18nData: { status: "completed", reason },
    performedBy: session.user.id,
  })

  revalidatePath(`/admin/requests/${requestId}`)
  return { id: requestId }
}

// ─── Admin: get tasks for a request ──────────────────────────────────────────

export async function getTasksForRequest(requestId: string) {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .selectDistinct({
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
    // Left joins: a task with no delivery_task_item rows (legacy fixtures, or
    // any task created without going through allocateTaskItem) must still
    // surface via its own requestId column below — see syncRequestStatus for
    // the same two-signal merge.
    .leftJoin(deliveryTaskItems, eq(deliveryTaskItems.partnerTaskId, partnerTasks.id))
    .leftJoin(requestItems, eq(requestItems.id, deliveryTaskItems.requestItemId))
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .leftJoin(partnerContracts, eq(partnerTasks.contractId, partnerContracts.id))
    .leftJoin(customerContacts, eq(partnerTasks.contactId, customerContacts.id))
    .where(or(eq(partnerTasks.requestId, requestId), eq(requestItems.requestId, requestId)))
    .orderBy(desc(partnerTasks.createdAt))
}

// ─── Admin: sign off task ─────────────────────────────────────────────────────

export type PaymentDecision = "full" | "partial" | "none" | "hold"

export type SignOffInput = {
  decision: PaymentDecision
  quantity?: number
  approvedAmount?: number
  reason?: string
}

export async function signOffTask(taskId: string, input: SignOffInput): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }
  const { decision, quantity, approvedAmount, reason } = input

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task) return { error: "Task not found" }

  // Supplier-pickup tasks NEVER close through admin sign-off — completion
  // happens only via warehouse receipt (receivePurchaseOrderLineCore).
  if (task.kind === "supplier_pickup") {
    return { error: "Pickup tasks are closed by warehouse receipt, not sign-off" }
  }

  // Delivery Batching v2 P4: every request this task's delivery_task_item rows
  // touch must independently satisfy the proof/cancellation gates below — a
  // legacy or single-request-batch task is just the n=1 case of this loop, so
  // its behavior is unchanged. Payment/close/quantity stay task-scoped (one
  // trip, one payment) — only the request-facing gates and side effects are
  // per-request-aware.
  const affectedRequestIds = await getAffectedRequestIds(taskId)
  if (affectedRequestIds.length === 0) {
    return { error: "This task has no linked request items to sign off" }
  }

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
  const parentRequests = await db.select().from(requests).where(inArray(requests.id, affectedRequestIds))
  if (parentRequests.length !== affectedRequestIds.length) return { error: "Request no longer exists" }
  const blockedRequest = parentRequests.find(
    (r) => r.deletedAt || r.status === "cancelled" || (r.status === "failed" && !isOverride)
  )
  if (blockedRequest) return { error: "Cannot sign off a task on a cancelled request" }

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
  if (
    decision !== "hold" &&
    contract &&
    requiresQuantity(contract.pricingModel as PricingModel) &&
    !quantity
  ) {
    return { error: "Quantity is required for this contract's pricing model" }
  }

  if (decision === "partial" && (!approvedAmount || approvedAmount <= 0)) {
    return { error: "Approved amount is required for a partial payment decision" }
  }
  if ((decision === "partial" || decision === "none") && !reason?.trim()) {
    return { error: "A reason is required for this payment decision" }
  }

  // Payment gate: "admin-approved proof that the delivery visit occurred",
  // checked per affected request — a genuine batch must not close until EVERY
  // request it covers has its own accepted proof (signatures are never merged
  // across requests, see delivery-batching design). Outcome-agnostic —
  // partial/refused/unavailable/rescheduled outcomes remain fully eligible for
  // admin payment review; only accepted-proof presence (when enforcement is
  // on) is checked here.
  //
  // requiresSignature — only when proof enforcement is enabled AND the resolved
  // proof config for that request's type includes a signature. Enforcement is
  // OFF by default so operators can author proof config before it blocks.
  //
  // Accepted proof for a request = a "signed" signature request for THAT
  // request, scoped to this task when set (batched signing always sets both
  // partnerTaskId and requestId) or unscoped-by-task for legacy signature
  // requests that predate per-task linkage.
  const missingProofRequestNumbers: string[] = []
  if (!isOverride && (await isProofEnforcementEnabled())) {
    const systemDefault = await getSystemDefaultProof()
    const typeIds = [...new Set(parentRequests.map((r) => r.typeId))]
    const typeRows = await db
      .select({ id: requestTypes.id, proofConfig: requestTypes.proofConfig })
      .from(requestTypes)
      .where(inArray(requestTypes.id, typeIds))
    const proofConfigByTypeId = new Map(typeRows.map((t) => [t.id, t.proofConfig]))

    for (const req of parentRequests) {
      const proof = resolveProofRequirements(
        [parseProofConfig(proofConfigByTypeId.get(req.typeId))],
        {},
        systemDefault
      )
      if (!proof.signature) continue

      const [proofRow] = await db
        .select({ outcome: customerSignatures.deliveryOutcome })
        .from(customerSignatures)
        .innerJoin(signatureRequests, eq(customerSignatures.signatureRequestId, signatureRequests.id))
        .where(
          and(
            eq(signatureRequests.status, "signed"),
            eq(signatureRequests.requestId, req.id),
            or(eq(signatureRequests.partnerTaskId, taskId), isNull(signatureRequests.partnerTaskId))
          )
        )
        .orderBy(desc(customerSignatures.signedAt))
        .limit(1)

      const gateDecision = canSignOff({ isOverride, requiresSignature: true, hasAcceptedProof: !!proofRow })
      if (!gateDecision.ok) missingProofRequestNumbers.push(req.requestNumber)
    }
  }
  if (missingProofRequestNumbers.length > 0) {
    return {
      error:
        missingProofRequestNumbers.length === affectedRequestIds.length && affectedRequestIds.length === 1
          ? "A signed customer signature is required before this task can be closed"
          : `A signed customer signature is required before this task can be closed — missing for: ${missingProofRequestNumbers.join(", ")}`,
    }
  }

  // Task-scoped delivery allocation (new multi-task model). Legacy tasks
  // created before this feature have no rows here — fall back to the
  // whole-request behavior below rather than blocking sign-off on old data.
  const taskItems = await db
    .select()
    .from(deliveryTaskItems)
    .where(eq(deliveryTaskItems.partnerTaskId, taskId))

  // Serial gate: any serialized allocation (request_item.orderUnitId set) with
  // qty_delivered > 0 must have an admin-approved serial before this task can
  // close — partner-reported serials are evidence only until approved.
  if (decision !== "hold" && taskItems.length > 0) {
    const itemIds = taskItems.map((ti) => ti.requestItemId)
    const items = await db.select().from(requestItems).where(inArray(requestItems.id, itemIds))
    const serializedItemIds = new Set(items.filter((i) => i.orderUnitId).map((i) => i.id))
    const unapproved = taskItems.find(
      (ti) => serializedItemIds.has(ti.requestItemId) && ti.qtyDelivered > 0 && ti.verificationStatus !== "approved"
    )
    if (unapproved) {
      return { error: "Reported serials are pending approval — approve or correct them before sign-off" }
    }
  }

  if (decision === "hold") {
    // Hold never closes the task and never creates a payment — upsert the
    // decision only, so the intent is recorded and revisitable.
    await db
      .insert(partnerPaymentDecisions)
      .values({
        id: createId(),
        partnerTaskId: taskId,
        decision: "hold",
        reason: reason?.trim() || null,
        decidedBy: session.user.id,
        decidedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: partnerPaymentDecisions.partnerTaskId,
        set: { decision: "hold", reason: reason?.trim() || null, updatedAt: Date.now() },
      })
    for (const requestId of affectedRequestIds) revalidatePath(`/admin/requests/${requestId}`)
    return { id: taskId }
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
      payload: { requestIds: affectedRequestIds, isOverride, quantity: quantity ?? null },
      dedupeKey: `task:${taskId}:TaskClosed`,
      actorUserId: session.user.id,
    })

    // Guarded cumulative delivered-quantity increment — physical delivery
    // truth is independent of payment truth, so this runs for every non-hold
    // decision including "none". Never exceeds request_item.quantity (CAS).
    for (const ti of taskItems) {
      if (ti.qtyDelivered <= 0) continue
      await tx
        .update(requestItems)
        .set({ deliveredQuantity: sql`${requestItems.deliveredQuantity} + ${ti.qtyDelivered}`, updatedAt: Date.now() })
        .where(
          and(
            eq(requestItems.id, ti.requestItemId),
            sql`${requestItems.deliveredQuantity} + ${ti.qtyDelivered} <= ${requestItems.quantity}`
          )
        )
    }

    // Payment decision — always recorded, one per task (idempotent upsert).
    const finalAmount =
      decision === "full"
        ? contract
          ? computePayment(contract.pricingModel as PricingModel, contract.unitPrice, quantity).totalAmount
          : 0
        : decision === "partial"
          ? (approvedAmount as number)
          : null

    await tx
      .insert(partnerPaymentDecisions)
      .values({
        id: createId(),
        partnerTaskId: taskId,
        decision,
        approvedAmount: finalAmount,
        reason: reason?.trim() || null,
        decidedBy: session.user.id,
        decidedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: partnerPaymentDecisions.partnerTaskId,
        set: {
          decision,
          approvedAmount: finalAmount,
          reason: reason?.trim() || null,
          decidedBy: session.user.id,
          decidedAt: Date.now(),
          updatedAt: Date.now(),
        },
      })

    // Only full/partial ever create a partner_payment row — "none" must never
    // produce a zero-value accounting record.
    if ((decision === "full" || decision === "partial") && contract) {
      const { quantity: finalQty } = computePayment(
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
        totalAmount: finalAmount as number,
        status: "pending",
      })

      await emitDomainEvent(tx, {
        aggregateType: "partner_payment",
        aggregateId: paymentId,
        eventType: "PartnerPaymentCreated",
        payload: { partnerId: task.partnerId, partnerTaskId: task.id, totalAmount: finalAmount },
        dedupeKey: `partner_payment:${paymentId}:PartnerPaymentCreated`,
        actorUserId: session.user.id,
      })
    }

    // OI-1: move devices through the asset lifecycle in the SAME transaction as
    // the task close, PER affected request — different requests in a batch
    // can be different request types (e.g. delivery vs collection), so each
    // gets its own assetAction resolved from its own type. Scoped to THIS
    // task's approved serialized allocations when delivery_task_item rows
    // exist (attributed to their owning request); legacy tasks (no rows) fall
    // back to the whole-request set, matching pre-existing behavior exactly.
    const typeIds = [...new Set(parentRequests.map((r) => r.typeId))]
    const typeRows = await tx
      .select({ id: requestTypes.id, slug: requestTypes.slug })
      .from(requestTypes)
      .where(inArray(requestTypes.id, typeIds))
    const slugByTypeId = new Map(typeRows.map((t) => [t.id, t.slug]))

    let itemIdToRequestId = new Map<string, string>()
    if (taskItems.length > 0) {
      const itemRows = await tx
        .select({ id: requestItems.id, requestId: requestItems.requestId })
        .from(requestItems)
        .where(inArray(requestItems.id, taskItems.map((ti) => ti.requestItemId)))
      itemIdToRequestId = new Map(itemRows.map((i) => [i.id, i.requestId]))
    }

    for (const req of parentRequests) {
      const slug = slugByTypeId.get(req.typeId)
      const assetAction =
        slug === "collection" ? ("return" as const)
        : slug === "delivery" || slug === "installation" || slug === "swap" ? ("deliver" as const)
        : null
      if (!assetAction) continue

      let unitIds: string[] = []
      if (taskItems.length > 0) {
        const approvedSerialized = taskItems.filter(
          (ti) =>
            ti.verificationStatus === "approved" &&
            ti.qtyDelivered > 0 &&
            itemIdToRequestId.get(ti.requestItemId) === req.id
        )
        if (approvedSerialized.length > 0) {
          const items = await tx
            .select()
            .from(requestItems)
            .where(inArray(requestItems.id, approvedSerialized.map((ti) => ti.requestItemId)))
          unitIds = items.map((i) => i.orderUnitId).filter((v): v is string => Boolean(v))
        }
      } else {
        const pulled = await tx
          .select({ orderUnitId: requestItems.orderUnitId })
          .from(requestItems)
          .where(and(eq(requestItems.requestId, req.id), isNotNull(requestItems.orderUnitId)))
        unitIds = pulled.map((r) => r.orderUnitId).filter((v): v is string => Boolean(v))
      }

      // Sale units complete the sale on delivery: after the deliver transition
      // they move straight to "sold" (they never become rentable/returnable).
      // Rental units stay "delivered" (out with the customer until collected).
      const saleUnitIds = new Set<string>()
      if (assetAction === "deliver" && unitIds.length > 0) {
        const kinds = await tx
          .select({ id: orderUnits.id, kind: orderUnits.kind })
          .from(orderUnits)
          .where(inArray(orderUnits.id, unitIds))
        for (const u of kinds) if (u.kind === "sale") saleUnitIds.add(u.id)
      }

      for (const unitId of unitIds) {
        try {
          await applyAssetTransition(tx, unitId, assetAction, {
            requestId: req.id,
            customerId: req.customerId,
            byUserId: session.user.id,
          })
          if (assetAction === "deliver" && saleUnitIds.has(unitId)) {
            await applyAssetTransition(tx, unitId, "sell", {
              requestId: req.id,
              customerId: req.customerId,
              byUserId: session.user.id,
            })
          }
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

  for (const requestId of affectedRequestIds) {
    await logActivity({
      entityType: "request",
      entityId: requestId,
      action: isOverride ? "task_force_completed" : "task_signed_off",
      i18nKey: isOverride ? "activity.taskForceCompleted" : "activity.taskSignedOff",
      performedBy: session.user.id,
    })

    // OI-0: a "none" decision produces no partner payment. Record why, so a
    // zero-payment close is an explicit, audited decision rather than silent.
    if (decision === "none") {
      await logActivity({
        entityType: "request",
        entityId: requestId,
        action: "task_closed_no_payment",
        i18nKey: "activity.taskClosedNoPayment",
        i18nData: { reason: reason ?? "no_contract" },
        performedBy: session.user.id,
      })
    }

    await syncRequestStatus(requestId)
    revalidatePath(`/admin/requests/${requestId}`)
  }
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
  if (task.kind === "supplier_pickup") {
    return { error: "Pickup tasks have no sign-off proof to reject" }
  }
  if (task.status !== "pending_signoff") {
    return { error: "Task is not awaiting sign-off" }
  }
  const affectedRequestIds = await getAffectedRequestIds(taskId)
  if (affectedRequestIds.length === 0) {
    return { error: "This task has no linked request items to reject" }
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

    for (const requestId of affectedRequestIds) {
      await logActivity(
        {
          entityType: "request",
          entityId: requestId,
          action: "task_proof_rejected",
          i18nKey: "activity.taskProofRejected",
          i18nData: reason ? { reason } : undefined,
          performedBy: session.user.id,
        },
        tx
      )
    }

    await emitDomainEvent(tx, {
      aggregateType: "task",
      aggregateId: taskId,
      eventType: "TaskProofRejected",
      payload: { requestIds: affectedRequestIds, reason: reason ?? null },
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
    const requestRows = await db
      .select({ requestNumber: requests.requestNumber })
      .from(requests)
      .where(inArray(requests.id, affectedRequestIds))

    if (partner?.userId) {
      await notify({
        userId: partner.userId,
        type: "task_proof_rejected",
        i18nKey: "notifications.taskProofRejected",
        i18nData: { requestNumber: requestRows.map((r) => r.requestNumber).join(", ") },
        linkUrl: `/task/${task.taskToken}`,
        entityType: "partner_task",
        entityId: taskId,
      })
    }
  } catch (error) {
    console.error("tasks: swallowed fallback error", error)
    // Notification failures must not block the rejection itself.
  }

  for (const requestId of affectedRequestIds) {
    await syncRequestStatus(requestId)
    revalidatePath(`/admin/requests/${requestId}`)
  }
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

  const affectedRequestIds = task.kind === "request" ? await getAffectedRequestIds(taskId) : []

  await db.transaction(async (tx) => {
    await tx
      .update(partnerTasks)
      .set({ status: "cancelled", taskTokenExpiresAt: Date.now(), updatedAt: Date.now() })
      .where(eq(partnerTasks.id, taskId))

    if (affectedRequestIds.length > 0) {
      for (const requestId of affectedRequestIds) {
        await logActivity(
          {
            entityType: "request",
            entityId: requestId,
            action: "task_cancelled",
            i18nKey: "activity.taskCancelled",
            performedBy: session.user.id,
          },
          tx
        )
      }
    } else {
      await logActivity(
        {
          entityType: "purchase_order",
          entityId: task.purchaseOrderId ?? task.id,
          action: "task_cancelled",
          i18nKey: "activity.taskCancelled",
          performedBy: session.user.id,
        },
        tx
      )
    }

    await emitDomainEvent(tx, {
      aggregateType: "task",
      aggregateId: taskId,
      eventType: "TaskCancelled",
      payload: { fromStatus: task.status, toStatus: "cancelled" },
      dedupeKey: `task:${taskId}:TaskCancelled`,
      actorUserId: session.user.id,
    })
  })

  if (task.kind === "request") {
    for (const requestId of affectedRequestIds) {
      await syncRequestStatus(requestId)
      revalidatePath(`/admin/requests/${requestId}`)
    }
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

  const affectedRequestIds = task.kind === "request" ? await getAffectedRequestIds(taskId) : []
  if (affectedRequestIds.length > 0) {
    for (const requestId of affectedRequestIds) {
      await logActivity({
        entityType: "request",
        entityId: requestId,
        action: "task_link_regenerated",
        i18nKey: "activity.taskLinkRegenerated",
        performedBy: session.user.id,
      })
      revalidatePath(`/admin/requests/${requestId}`)
    }
  } else {
    await logActivity({
      entityType: "purchase_order",
      entityId: task.purchaseOrderId ?? task.id,
      action: "task_link_regenerated",
      i18nKey: "activity.taskLinkRegenerated",
      performedBy: session.user.id,
    })
    if (task.purchaseOrderId) revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
  }
  return { id: taskId, taskToken }
}

// ─── Public: get task by token ────────────────────────────────────────────────

// One customer request's slice of a batched task — items scoped through
// delivery_task_item (not every item of the request, only the ones THIS task
// actually carries), so the courier sees exactly what's on this trip.
export type TaskBatchGroup = {
  request: typeof requests.$inferSelect
  customer: typeof customers.$inferSelect | null
  items: {
    id: string
    description: string
    brand: string | null
    model: string | null
    serialNumber: string | null
    accessories: string | null
    quantity: number
  }[]
}

export async function loadTaskBatchGroup(taskId: string, requestId: string): Promise<TaskBatchGroup | null> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!request) return null

  const [items, [customer]] = await Promise.all([
    db
      .select({
        id: requestItems.id,
        description: requestItems.description,
        brand: requestItems.brand,
        model: requestItems.model,
        serialNumber: requestItems.serialNumber,
        accessories: requestItems.accessories,
        quantity: deliveryTaskItems.qtyPlanned,
      })
      .from(deliveryTaskItems)
      .innerJoin(requestItems, eq(requestItems.id, deliveryTaskItems.requestItemId))
      .where(and(eq(deliveryTaskItems.partnerTaskId, taskId), eq(requestItems.requestId, requestId))),
    db.select().from(customers).where(eq(customers.id, request.customerId)),
  ])

  return { request, customer: customer ?? null, items }
}

export async function getTaskByToken(token: string) {
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, token))

  if (!task) return null

  // Supplier-pickup tasks have no request/customer — the partner page shows
  // supplier pickup info + expected PO lines instead (getPickupTaskByToken in
  // lib/actions/procurement-pickup.ts). Signal the kind so the route branches.
  if (task.kind === "supplier_pickup") {
    return { task, request: null, partner: null, customer: null, items: [], requestType: null, linkedContact: null, isExpired: task.taskTokenExpiresAt < Date.now(), batchGroups: null }
  }

  // Delivery Batching v2 P3: a genuine cross-request batch (requestId left
  // null — see delivery-batching.ts) has no single request/customer context.
  // Group its items by request instead so the courier can tell what belongs
  // to which customer. A single-request task (legacy, or a batch that
  // happens to cover exactly one request) keeps requestId set and falls
  // through to the unchanged branch below.
  if (!task.requestId) {
    const [[partner], affectedRequestIds] = await Promise.all([
      db.select().from(partners).where(eq(partners.id, task.partnerId)),
      getAffectedRequestIds(task.id),
    ])
    const batchGroups = (
      await Promise.all(affectedRequestIds.map((requestId) => loadTaskBatchGroup(task.id, requestId)))
    ).filter((g): g is TaskBatchGroup => g !== null)

    // A request-kind task with no surviving delivery_task_item coverage is
    // corrupt/orphaned data (every item's request got deleted, or the task
    // was created without allocation) — never render an empty "0 requests"
    // batch view, treat it the same as "task not found".
    if (batchGroups.length === 0) return null

    return {
      task,
      request: null,
      partner: partner ?? null,
      customer: null,
      items: [],
      requestType: null,
      linkedContact: null,
      isExpired: task.taskTokenExpiresAt < Date.now(),
      batchGroups,
    }
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
    batchGroups: null,
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
  const affectedRequestIds = task.kind === "request" ? await getAffectedRequestIds(task.id) : []
  let rowsChanged = 0
  await db.transaction(async (tx) => {
    const updateResult = await tx
      .update(partnerTasks)
      .set(updates)
      .where(and(eq(partnerTasks.taskToken, token), eq(partnerTasks.status, task.status)))
    rowsChanged = (updateResult as { rowsAffected?: number }).rowsAffected ?? 1
    if (rowsChanged === 0) return

    if (affectedRequestIds.length > 0) {
      for (const requestId of affectedRequestIds) {
        await logActivity(
          {
            entityType: "request",
            entityId: requestId,
            action: `task_${action}`,
            i18nKey: `activity.task_${action}`,
            performedAs: "partner_link",
          },
          tx
        )
      }
    } else {
      await logActivity(
        {
          entityType: "purchase_order",
          entityId: task.purchaseOrderId ?? task.id,
          action: `task_${action}`,
          i18nKey: `activity.task_${action}`,
          performedAs: "partner_link",
        },
        tx
      )
    }

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

  for (const requestId of affectedRequestIds) {
    await syncRequestStatus(requestId)
  }
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

  // foreign_keys is ON on this DB (verified against prod — the "FK pragma is
  // off" assumption below was wrong), so every child row referencing this task
  // must be deleted first or the hard-delete throws FOREIGN KEY constraint
  // failed. Clean them all up in the same transaction.
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
    await tx
      .delete(deliveryTaskItems)
      .where(eq(deliveryTaskItems.partnerTaskId, taskId))
    // signature_request.partner_task_id is nullable — detach rather than
    // delete, since a signature is a legal record that must survive the task
    // that requested it.
    await tx
      .update(signatureRequests)
      .set({ partnerTaskId: null })
      .where(eq(signatureRequests.partnerTaskId, taskId))
    await tx.delete(partnerTasks).where(eq(partnerTasks.id, taskId))
  })

  if (task.requestId) revalidatePath(`/admin/requests/${task.requestId}`)
  else if (task.purchaseOrderId) revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
  return {}
}
