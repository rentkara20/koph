"use server"

import { checkRateLimit } from "@/lib/utils/rate-limit"
import { desc, eq, and, inArray, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import {
  signatureRequests,
  signatureEvents,
  signatureItemConditions,
  customerSignatures,
  customerContacts,
  consentVersions,
  customers,
  partnerTasks,
  requests,
  requestItems,
} from "@/lib/db/schema"
import { createId, generateSecureToken, generateVerificationId } from "@/lib/utils/ids"
import { publicUrl } from "@/lib/utils/public-url"
import {
  buildSignatureSnapshot,
  type DeliveryOutcome,
  type SnapshotItem,
} from "@/lib/domain/signature-snapshot"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { logActivity } from "@/lib/utils/activity"
import { sendEmail } from "@/lib/email/resend"
import { deliveryNoteSignedEmail } from "@/lib/email/templates"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import {
  createSignatureRequestSchema,
  signOnSiteSchema,
  submitSignatureSchema,
  firstError,
} from "@/lib/validation/schemas"
import { getAffectedRequestIds, loadTaskBatchGroup, getTasksForRequest } from "@/lib/actions/tasks"

// Terminal task statuses — a signature request should never bind itself to a
// task that's already closed/rejected/failed/cancelled (no active trip left
// to gate).
const TERMINAL_TASK_STATUSES = ["closed", "rejected", "failed", "cancelled"]

// Statuses from which a signature request can never transition again
const TERMINAL_SIGNATURE_STATUSES = ["signed", "rejected", "cancelled", "expired"]

// Thrown inside a signing transaction when the guarded status UPDATE affects 0
// rows — a concurrent submit already signed this request. Aborts the tx so the
// duplicate customerSignatures row rolls back; the caller maps it to a message.
class StaleSignatureError extends Error {}
function assertSigned(result: unknown): void {
  if (((result as { rowsAffected?: number }).rowsAffected ?? 0) === 0) throw new StaleSignatureError()
}

async function captureRequestMeta() {
  const h = await headers()
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    h.get("cf-connecting-ip") ??
    null
  const userAgent = h.get("user-agent") ?? null
  return { ipAddress, userAgent }
}

async function buildAuditHash(payload: (string | null | undefined)[]): Promise<string> {
  const text = payload.map((v) => v ?? "").join("|")
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return "sha256:" + hex
}

export type SignatureActionResult = { error?: string; id?: string; token?: string }

// Freezes the receipt as presented at signing into a JSON snapshot. Reads live
// item/customer rows once, at signing time; the stored snapshot is what the
// delivery note renders thereafter, so later request edits never rewrite it.
// Returns null when there is no linked request (nothing to snapshot).
async function buildSnapshotJson(input: {
  requestId: string | null
  requestNumber: string
  quoteNumber: string
  customerId: string
  itemConditions?: { requestItemId: string; condition: "good" | "damaged" | "missing"; receivedQuantity?: number }[]
  deliveryOutcome: DeliveryOutcome | null
  remarks: string | null
  signer: { fullName: string; position: string | null; nationalId: string | null }
  signedAt: number
  // Delivery Batching v2 P4: when this signature covers only ONE request
  // group's items within a batched task (not every item of the request),
  // scope the snapshot to exactly those items — a legal receipt must never
  // imply acknowledgement of items outside what was actually on this trip.
  // Undefined/omitted (legacy, non-batched) keeps the whole-request snapshot.
  onlyItemIds?: string[]
}): Promise<string | null> {
  if (!input.requestId) return null

  const [customer] = await db
    .select({
      name: customers.name,
      contactPerson: customers.contactPerson,
      mobile: customers.mobile,
      city: customers.city,
    })
    .from(customers)
    .where(eq(customers.id, input.customerId))

  const itemFilter = input.onlyItemIds
    ? and(eq(requestItems.requestId, input.requestId), inArray(requestItems.id, input.onlyItemIds))
    : eq(requestItems.requestId, input.requestId)

  const rawItems = await db
    .select({
      id: requestItems.id,
      description: requestItems.description,
      brand: requestItems.brand,
      model: requestItems.model,
      serialNumber: requestItems.serialNumber,
      quantity: requestItems.quantity,
      accessories: requestItems.accessories,
    })
    .from(requestItems)
    .where(itemFilter)

  const condMap = new Map(
    (input.itemConditions ?? []).map((c) => [c.requestItemId, c])
  )
  const items: SnapshotItem[] = rawItems.map((i) => {
    const c = condMap.get(i.id)
    return {
      ...i,
      condition: c?.condition ?? null,
      receivedQuantity: c?.receivedQuantity ?? null,
    }
  })

  const snapshot = buildSignatureSnapshot({
    requestNumber: input.requestNumber || null,
    quoteNumber: input.quoteNumber || null,
    customer: customer ?? null,
    items,
    deliveryOutcome: input.deliveryOutcome,
    remarks: input.remarks,
    signer: input.signer,
    signedAt: input.signedAt,
  })
  return JSON.stringify(snapshot)
}

// ─── Admin: create signature request ─────────────────────────────────────────

export async function createSignatureRequest(
  requestId: string,
  data: {
    documentName: string
    requireNationalId?: boolean
  }
): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createSignatureRequestSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [req] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!req) return { error: "Request not found" }

  const secureToken = generateSecureToken()
  const verificationId = generateVerificationId()
  const id = createId()

  // Bind to the request's own active task when one exists — required so the
  // per-request OTP/stage-unlock gate (isDeliveryStageUnlocked) can find this
  // row for a batched task, which scopes its lookup by (partnerTaskId,
  // requestId) and would otherwise silently treat the stage as unlocked.
  const tasksForRequest = await getTasksForRequest(requestId)
  const activeTask = tasksForRequest.find((t) => !TERMINAL_TASK_STATUSES.includes(t.status))

  await db.insert(signatureRequests).values({
    id,
    requestId,
    partnerTaskId: activeTask?.id ?? null,
    initiatedBy: "admin",
    initiatorId: session.user.id,
    customerId: req.customerId,
    documentName: data.documentName.trim(),
    secureToken,
    verificationId,
    requireNationalId: data.requireNationalId ?? false,
    status: "draft",
  })

  await logActivity({
    entityType: "signature_request",
    entityId: id,
    action: "signature_request_created",
    i18nKey: "activity.signatureRequestCreated",
    i18nData: { documentName: data.documentName },
    performedBy: session.user.id,
  })

  revalidatePath(`/admin/requests/${requestId}`)
  return { id, token: secureToken }
}

// ─── Admin: get signature requests for a request ──────────────────────────────

export async function getSignatureRequestsForRequest(requestId: string) {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({
      id: signatureRequests.id,
      documentName: signatureRequests.documentName,
      status: signatureRequests.status,
      secureToken: signatureRequests.secureToken,
      requireNationalId: signatureRequests.requireNationalId,
      createdAt: signatureRequests.createdAt,
      signatoryRole: signatureRequests.signatoryRole,
      parentSignatureRequestId: signatureRequests.parentSignatureRequestId,
      signerName: customerSignatures.fullName,
      signedAt: customerSignatures.signedAt,
      signatureMethod: customerSignatures.signatureMethod,
      uploadedFileUrl: customerSignatures.uploadedFileUrl,
      approvedAt: customerSignatures.approvedAt,
      reviewNotes: customerSignatures.reviewNotes,
    })
    .from(signatureRequests)
    .leftJoin(customerSignatures, eq(customerSignatures.signatureRequestId, signatureRequests.id))
    .where(eq(signatureRequests.requestId, requestId))
    .orderBy(desc(signatureRequests.createdAt))
}

// ─── Admin: get all signature requests (for list page) ───────────────────────

export async function getAllSignatureRequests() {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({
      id: signatureRequests.id,
      documentName: signatureRequests.documentName,
      status: signatureRequests.status,
      secureToken: signatureRequests.secureToken,
      requireNationalId: signatureRequests.requireNationalId,
      createdAt: signatureRequests.createdAt,
      requestId: signatureRequests.requestId,
      customerId: signatureRequests.customerId,
      customerName: customers.name,
      requestNumber: requests.requestNumber,
    })
    .from(signatureRequests)
    .leftJoin(customers, eq(signatureRequests.customerId, customers.id))
    .leftJoin(requests, eq(signatureRequests.requestId, requests.id))
    .orderBy(desc(signatureRequests.createdAt))
}

// ─── Admin: mark as sent ──────────────────────────────────────────────────────

export async function markSignatureAsSent(id: string): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
  if (!sig) return { error: "Not found" }
  if (sig.status !== "draft") return { error: "Only draft requests can be marked as sent" }

  await db.transaction(async (tx) => {
    await tx
      .update(signatureRequests)
      .set({ status: "sent", updatedAt: Date.now() })
      .where(eq(signatureRequests.id, id))

    await tx.insert(signatureEvents).values({
      id: createId(),
      signatureRequestId: id,
      eventType: "sent",
    })

    await emitDomainEvent(tx, {
      aggregateType: "signature_request",
      aggregateId: id,
      eventType: "SignatureSent",
      payload: { requestId: sig.requestId ?? null },
      dedupeKey: `signature_request:${id}:SignatureSent`,
      actorUserId: session.user.id,
    })
  })

  if (sig.requestId) {
    await logActivity({
      entityType: "signature_request",
      entityId: id,
      action: "signature_request_sent",
      i18nKey: "activity.signatureRequestSent",
      performedBy: session.user.id,
    })
    revalidatePath(`/admin/requests/${sig.requestId}`)
  }

  return { id }
}

// ─── Admin: cancel signature request ─────────────────────────────────────────

export async function cancelSignatureRequest(id: string): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
  if (!sig) return { error: "Not found" }

  if (TERMINAL_SIGNATURE_STATUSES.includes(sig.status)) return { error: "Cannot cancel a completed request" }

  await db.transaction(async (tx) => {
    await tx
      .update(signatureRequests)
      // Cancellation invalidates any live OTP immediately.
      .set({ status: "cancelled", otpHash: null, otpExpiresAt: null, updatedAt: Date.now() })
      .where(eq(signatureRequests.id, id))

    await emitDomainEvent(tx, {
      aggregateType: "signature_request",
      aggregateId: id,
      eventType: "SignatureCancelled",
      payload: { requestId: sig.requestId ?? null, fromStatus: sig.status },
      dedupeKey: `signature_request:${id}:SignatureCancelled`,
      actorUserId: session.user.id,
    })
  })

  if (sig.requestId) {
    await logActivity({
      entityType: "signature_request",
      entityId: id,
      action: "signature_request_cancelled",
      i18nKey: "activity.signatureRequestCancelled",
      performedBy: session.user.id,
    })
    revalidatePath(`/admin/requests/${sig.requestId}`)
  }

  return { id }
}

// ─── Public: get signature request by token ───────────────────────────────────

export async function getSignatureByToken(token: string) {
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return null

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, sig.customerId))

  let request = null
  if (sig.requestId) {
    const [req] = await db.select().from(requests).where(eq(requests.id, sig.requestId))
    request = req ?? null
  }

  const [activeConsent] = await db
    .select()
    .from(consentVersions)
    .where(eq(consentVersions.isActive, true))
    .limit(1)

  const isExpired = sig.expiryEnabled && sig.expiresAt ? sig.expiresAt < Date.now() : false

  return {
    sig,
    customer: customer ?? null,
    request,
    activeConsent: activeConsent ?? null,
    isExpired,
  }
}

// ─── Public: record opened event (called server-side on page load) ────────────

export async function recordSignatureOpened(
  token: string,
  ipAddress?: string,
  userAgent?: string
) {
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig || sig.status !== "sent") return

  await db
    .update(signatureRequests)
    .set({ status: "opened", updatedAt: Date.now() })
    .where(eq(signatureRequests.id, sig.id))

  await db.insert(signatureEvents).values({
    id: createId(),
    signatureRequestId: sig.id,
    eventType: "opened",
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  })
}

// ─── Public: submit signature ─────────────────────────────────────────────────

export async function submitSignature(
  token: string,
  data: {
    fullName: string
    mobile?: string
    nationalId?: string
    position?: string
    signatureData: string
    deliveryOutcome?: DeliveryOutcome
    remarks?: string
    itemConditions?: {
      requestItemId: string
      condition: "good" | "damaged" | "missing"
      receivedQuantity?: number
      notes?: string
    }[]
  }
): Promise<SignatureActionResult> {
  if (!checkRateLimit(`sig-submit:${token}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return { error: "Not found" }

  if (TERMINAL_SIGNATURE_STATUSES.includes(sig.status)) return { error: "This request is no longer active" }
  if (sig.status === "draft") return { error: "This link has not been activated yet" }
  if (sig.expiryEnabled && sig.expiresAt && sig.expiresAt < Date.now()) {
    return { error: "This signing link has expired" }
  }

  const parsed = submitSignatureSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }
  if (sig.requireNationalId && !data.nationalId?.trim()) {
    return { error: "National ID / Iqama is required" }
  }

  const [consent] = await db
    .select()
    .from(consentVersions)
    .where(eq(consentVersions.isActive, true))
    .limit(1)

  // Ensure verificationId exists on the sig request
  let verificationId = sig.verificationId
  if (!verificationId) {
    verificationId = generateVerificationId()
    await db.update(signatureRequests).set({ verificationId }).where(eq(signatureRequests.id, sig.id))
  }

  // Fetch related data for audit hash
  const [customerRow] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, sig.customerId))
  let requestNumber = ""
  let quoteNumber = ""
  if (sig.requestId) {
    const [reqRow] = await db
      .select({
        requestNumber: requests.requestNumber,
        quoteNumber: requests.quoteNumber,
      })
      .from(requests)
      .where(eq(requests.id, sig.requestId))
    requestNumber = reqRow?.requestNumber ?? ""
    quoteNumber = reqRow?.quoteNumber ?? ""
  }

  const { ipAddress, userAgent } = await captureRequestMeta()
  const id = createId()
  const now = Date.now()
  const signedAtIso = new Date(now).toISOString()
  const fullName = data.fullName.trim()
  const nationalId = data.nationalId?.trim() || null

  const auditDataHash = await buildAuditHash([
    requestNumber,
    quoteNumber,
    customerRow?.name ?? "",
    fullName,
    nationalId,
    signedAtIso,
    verificationId,
    ipAddress,
    userAgent,
  ])

  // Ownership check for per-item conditions: every requestItemId MUST belong to
  // this signature's request. Without this a caller could plant fabricated
  // "damaged"/"missing" condition rows against another customer's request items.
  if (data.itemConditions && data.itemConditions.length > 0) {
    if (!sig.requestId) return { error: "This signature has no request to attach item conditions to" }
    const itemIds = [...new Set(data.itemConditions.map((c) => c.requestItemId))]
    const owned = await db
      .select({ id: requestItems.id })
      .from(requestItems)
      .where(and(inArray(requestItems.id, itemIds), eq(requestItems.requestId, sig.requestId)))
    if (owned.length !== itemIds.length) return { error: "Invalid item in signature" }
  }

  // Freeze an immutable snapshot of the receipt as presented at signing time.
  const snapshotJson = await buildSnapshotJson({
    requestId: sig.requestId,
    requestNumber,
    quoteNumber,
    customerId: sig.customerId,
    itemConditions: data.itemConditions,
    deliveryOutcome: data.deliveryOutcome ?? null,
    remarks: data.remarks ?? null,
    signer: { fullName, position: data.position ?? null, nationalId },
    signedAt: now,
  })

  try {
    await db.transaction(async (tx) => {
    // Guarded status flip FIRST: if a concurrent submit already signed this
    // request (double-tap / two tabs), 0 rows → abort so we don't persist a
    // second customerSignatures row for the same request.
    assertSigned(await tx
      .update(signatureRequests)
      // Signing invalidates any live OTP immediately (single-use).
      .set({ status: "signed", otpHash: null, otpExpiresAt: null, updatedAt: now })
      .where(and(eq(signatureRequests.id, sig.id), eq(signatureRequests.status, sig.status))))

    await tx.insert(customerSignatures).values({
      id,
      signatureRequestId: sig.id,
      fullName,
      mobile: data.mobile?.trim() ?? "",
      nationalId,
      position: data.position?.trim() || null,
      signatureData: data.signatureData,
      signatureMethod: "electronic",
      deliveryOutcome: data.deliveryOutcome ?? null,
      remarks: data.remarks?.trim() || null,
      snapshot: snapshotJson,
      consentVersion: consent?.version ?? null,
      consentAcceptedAt: now,
      signedAt: now,
      signedAtTz: "Asia/Riyadh",
      ipAddress,
      userAgent,
      auditDataHash,
    })

    await tx.insert(signatureEvents).values({
      id: createId(),
      signatureRequestId: sig.id,
      eventType: "signed",
      ipAddress,
      userAgent,
    })

    await emitDomainEvent(tx, {
      aggregateType: "signature_request",
      aggregateId: sig.id,
      eventType: "SignatureCompleted",
      payload: { requestId: sig.requestId ?? null, signatoryRole: sig.signatoryRole },
      dedupeKey: `signature_request:${sig.id}:SignatureCompleted`,
    })

    // Remote/electronic signature counts as accepted proof of delivery. Record
    // the signature-received time on the delivery task awaiting sign-off; never
    // closes it (admin sign-off remains the sole closer/payment gate). Only the
    // receiver stage (not authorised stage-2) advances the delivery task.
    if (sig.requestId && sig.signatoryRole !== "authorized" && data.deliveryOutcome !== "refused") {
      // Scope to the exact task this signature belongs to. The requestId-only
      // fallback is for legacy signature requests created before per-task
      // linkage existed (partnerTaskId null) — every new signature request is
      // created with partnerTaskId set, so multi-task requests are unaffected.
      await tx
        .update(partnerTasks)
        .set({ signatureReceivedAt: now, updatedAt: now })
        .where(
          sig.partnerTaskId
            ? and(eq(partnerTasks.id, sig.partnerTaskId), isNull(partnerTasks.signatureReceivedAt))
            : and(
                eq(partnerTasks.requestId, sig.requestId),
                eq(partnerTasks.status, "pending_signoff"),
                isNull(partnerTasks.signatureReceivedAt)
              )
        )
    }

    // Per-item acknowledgement of received condition (ownership validated above).
    if (data.itemConditions && data.itemConditions.length > 0) {
      await tx.insert(signatureItemConditions).values(
        data.itemConditions.map((c) => ({
          id: createId(),
          signatureRequestId: sig.id,
          requestItemId: c.requestItemId,
          condition: c.condition,
          receivedQuantity: c.receivedQuantity ?? null,
          notes: c.notes ?? null,
        }))
      )
    }
    })
  } catch (e) {
    if (e instanceof StaleSignatureError) return { error: "This request is no longer active" }
    throw e
  }

  if (sig.requestId) {
    await logActivity({
      entityType: "signature_request",
      entityId: sig.id,
      action: "signature_request_signed",
      i18nKey: "activity.signatureRequestSigned",
      i18nData: { fullName: data.fullName },
      performedAs: "system",
    })
    revalidatePath(`/admin/requests/${sig.requestId}`)
  }

  // Notifications + two-stage signatory chaining. Best-effort: never fail the
  // signature just because a downstream notification/stage-2 step errors.
  try {
    await handlePostSignature({
      sig,
      requestNumber,
      signerName: fullName,
    })
  } catch (error) {
    console.error("signatures: swallowed fallback error", error)
    // swallow — signing already succeeded and is the user-visible outcome
  }

  return { id }
}

type PostSignatureCtx = {
  sig: typeof signatureRequests.$inferSelect
  requestNumber: string
  signerName: string
}

async function handlePostSignature(ctx: PostSignatureCtx) {
  const { sig, requestNumber } = ctx

  // In-app notifications for signing (customer_signed / fully_signed) are now
  // event-driven: the SignatureCompleted domain event emitted inside the
  // signing transaction is turned into admin notifications by the outbox
  // notification consumer. This hook only sends the best-effort customer email
  // with the signed delivery-note link. No-ops when RESEND_API_KEY isn't
  // configured (see lib/email/resend.ts).
  if (sig.requestId) {
    const [customerRow] = await db
      .select({ name: customers.name, email: customers.email })
      .from(customers)
      .where(eq(customers.id, sig.customerId))
    if (customerRow?.email) {
      const printUrl = publicUrl(`/sign/${sig.secureToken}/print`)
      const { subject, html } = deliveryNoteSignedEmail({
        customerName: customerRow.name,
        requestNumber,
        printUrl,
      })
      await sendEmail({ to: customerRow.email, subject, html })
    }
  }
}

// ─── Admin: request authorised sign-off (stage-2) ────────────────────────────

export async function requestAuthorizedSignoff(
  receiverSignatureId: string
): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [receiver] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, receiverSignatureId))
  if (!receiver) return { error: "Signature request not found" }
  if (receiver.status !== "signed") return { error: "The receiver must sign first" }

  // If a stage-2 request already exists, return its link instead of duplicating.
  const [existing] = await db
    .select()
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.parentSignatureRequestId, receiver.id),
        eq(signatureRequests.signatoryRole, "authorized")
      )
    )
  if (existing) return { id: existing.id, token: existing.secureToken }

  // Find the flagged authorised signatory for this customer.
  const [authorizedContact] = await db
    .select({ id: customerContacts.id })
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, receiver.customerId),
        eq(customerContacts.isAuthorizedSignatory, true)
      )
    )
  if (!authorizedContact) {
    return { error: "No authorised signatory is flagged for this customer" }
  }

  const id = createId()
  const secureToken = generateSecureToken()
  await db.insert(signatureRequests).values({
    id,
    requestId: receiver.requestId,
    partnerTaskId: receiver.partnerTaskId,
    initiatedBy: "admin",
    initiatorId: session.user.id,
    customerId: receiver.customerId,
    signatoryRole: "authorized",
    parentSignatureRequestId: receiver.id,
    signatoryContactId: authorizedContact.id,
    documentName: receiver.documentName,
    secureToken,
    requireNationalId: receiver.requireNationalId,
    status: "sent",
  })

  if (receiver.requestId) {
    await logActivity({
      entityType: "signature_request",
      entityId: id,
      action: "authorized_signoff_requested",
      i18nKey: "activity.authorizedSignoffRequested",
      performedBy: session.user.id,
    })
    revalidatePath(`/admin/requests/${receiver.requestId}`)
  }

  return { id, token: secureToken }
}

// ─── Partner: get signature status for a task token ──────────────────────────

export async function getSignatureForTaskToken(taskToken: string) {
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, taskToken))

  if (!task?.requestId) return null

  const [sigReq] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.requestId, task.requestId))
    .orderBy(desc(signatureRequests.createdAt))
    .limit(1)

  if (!sigReq) return null

  const [sig] = await db
    .select()
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, sigReq.id))

  return {
    sigReq,
    sig: sig ?? null,
    signLink: publicUrl(`/sign/${sigReq.secureToken}`),
  }
}

// ─── Partner: sign on-site using task token ───────────────────────────────────

export async function signOnSiteByTaskToken(
  taskToken: string,
  data: {
    fullName: string
    nationalId: string
    signatureData: string
    mobile?: string
    position?: string
    deliveryOutcome?: DeliveryOutcome
    remarks?: string
    itemConditions?: {
      requestItemId: string
      condition: "good" | "damaged" | "missing"
      receivedQuantity?: number
    }[]
  }
): Promise<SignatureActionResult> {
  if (!checkRateLimit(`sig-onsite:${taskToken}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, taskToken))

  if (!task) return { error: "Task not found" }
  if (!task.requestId) return { error: "Task has no linked request" }
  if (task.taskTokenExpiresAt < Date.now()) return { error: "Link expired" }
  if (!["in_progress", "pending_signoff"].includes(task.status)) {
    return { error: "Task is not active for on-site signing" }
  }

  const parsed = signOnSiteSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [req] = await db.select().from(requests).where(eq(requests.id, task.requestId))
  if (!req) return { error: "Request not found" }

  // Find existing pending sig request or auto-create one
  let [sigReq] = await db
    .select()
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.requestId, task.requestId),
        eq(signatureRequests.status, "sent")
      )
    )
    .limit(1)

  if (!sigReq) {
    // Check any non-terminal sig request
    const [existing] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.requestId, task.requestId))
      .orderBy(desc(signatureRequests.createdAt))
      .limit(1)

    const isTimeExpired =
      existing?.expiryEnabled && existing.expiresAt ? existing.expiresAt < Date.now() : false
    if (existing && !TERMINAL_SIGNATURE_STATUSES.includes(existing.status) && !isTimeExpired) {
      sigReq = existing
    } else {
      // Auto-create
      const id = createId()
      const secureToken = generateSecureToken()
      const newVerificationId = generateVerificationId()
      await db.insert(signatureRequests).values({
        id,
        requestId: task.requestId,
        partnerTaskId: task.id,
        initiatedBy: "partner",
        customerId: req.customerId,
        documentName: "Delivery Note",
        secureToken,
        verificationId: newVerificationId,
        requireNationalId: true,
        status: "sent",
      })
      const [created] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
      sigReq = created
    }
  }

  if (!sigReq) return { error: "Could not find or create signature request" }

  if (TERMINAL_SIGNATURE_STATUSES.includes(sigReq.status)) return { error: "This document is already signed or cancelled" }

  // Ensure verificationId exists on the sig request
  let verificationId = sigReq.verificationId
  if (!verificationId) {
    verificationId = generateVerificationId()
    await db.update(signatureRequests).set({ verificationId }).where(eq(signatureRequests.id, sigReq.id))
  }

  // Fetch customer name for audit hash
  const [customerRow] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, req.customerId))

  const { ipAddress, userAgent } = await captureRequestMeta()
  const now = Date.now()
  const id = createId()
  const fullName = data.fullName.trim()
  const nationalId = data.nationalId.trim()
  const signedAtIso = new Date(now).toISOString()

  const auditDataHash = await buildAuditHash([
    req.requestNumber,
    req.quoteNumber,
    customerRow?.name ?? "",
    fullName,
    nationalId,
    signedAtIso,
    verificationId,
    ipAddress,
    userAgent,
  ])

  const snapshotJson = await buildSnapshotJson({
    requestId: task.requestId,
    requestNumber: req.requestNumber,
    quoteNumber: req.quoteNumber ?? "",
    customerId: req.customerId,
    itemConditions: data.itemConditions,
    deliveryOutcome: data.deliveryOutcome ?? null,
    remarks: data.remarks ?? null,
    signer: { fullName, position: data.position ?? null, nationalId },
    signedAt: now,
  })

  // Outcome drives both the signature record and the task/request transition.
  // refused → signature stands as evidence (status "rejected", NOT an accepted
  // proof of delivery) and the task fails. full_*/partial → accepted proof:
  // record delivery + signature-received time and leave the task at
  // pending_signoff for admin sign-off (partial also holds the request).
  const outcome = data.deliveryOutcome ?? null
  const refused = outcome === "refused"
  const sigStatus = refused ? "rejected" : "signed"

  try {
    await db.transaction(async (tx) => {
    // Guarded status flip first — abort on a concurrent double-submit so a
    // second signature record is never persisted for the same request.
    assertSigned(await tx
      .update(signatureRequests)
      .set({ status: sigStatus, otpHash: null, otpExpiresAt: null, updatedAt: now })
      .where(and(eq(signatureRequests.id, sigReq.id), eq(signatureRequests.status, sigReq.status))))

    await tx.insert(customerSignatures).values({
      id,
      signatureRequestId: sigReq.id,
      fullName,
      mobile: data.mobile?.trim() ?? "",
      nationalId,
      position: data.position?.trim() || null,
      signatureData: data.signatureData,
      signatureMethod: "electronic",
      deliveryOutcome: outcome,
      remarks: data.remarks?.trim() || null,
      snapshot: snapshotJson,
      consentAcceptedAt: now,
      signedAt: now,
      signedAtTz: "Asia/Riyadh",
      ipAddress,
      userAgent,
      auditDataHash,
    })

    await tx.insert(signatureEvents).values({
      id: createId(),
      signatureRequestId: sigReq.id,
      eventType: refused ? "rejected" : "signed",
    })

    await emitDomainEvent(tx, {
      aggregateType: "signature_request",
      aggregateId: sigReq.id,
      eventType: refused ? "SignatureRejected" : "SignatureCompleted",
      payload: { requestId: sigReq.requestId ?? null, signatoryRole: sigReq.signatoryRole },
      dedupeKey: `signature_request:${sigReq.id}:${refused ? "SignatureRejected" : "SignatureCompleted"}`,
    })

    // Task + request transition. Never closes the task — admin sign-off is the
    // sole closer/payment gate — but records delivery/proof times and moves the
    // task into the correct holding state.
    if (refused) {
      await tx
        .update(partnerTasks)
        .set({
          status: "failed",
          failureReason: task.failureReason ?? "other",
          failureNotes: data.remarks?.trim() || task.failureNotes || null,
          deliveredAt: task.deliveredAt ?? now,
          taskTokenExpiresAt: now,
          updatedAt: now,
        })
        .where(and(eq(partnerTasks.id, task.id), eq(partnerTasks.status, task.status)))
      await tx.update(requests).set({ status: "failed", updatedAt: now }).where(eq(requests.id, task.requestId!))
    } else {
      await tx
        .update(partnerTasks)
        .set({
          status: task.status === "in_progress" ? "pending_signoff" : task.status,
          completedAt: task.completedAt ?? now,
          deliveredAt: task.deliveredAt ?? now,
          signatureReceivedAt: now,
          updatedAt: now,
        })
        .where(and(eq(partnerTasks.id, task.id), eq(partnerTasks.status, task.status)))
      if (outcome === "partial") {
        await tx.update(requests).set({ status: "on_hold", updatedAt: now }).where(eq(requests.id, task.requestId!))
      }
    }
    })
  } catch (e) {
    if (e instanceof StaleSignatureError) return { error: "This document is already signed or cancelled" }
    throw e
  }

  await logActivity({
    entityType: "signature_request",
    entityId: sigReq.id,
    action: "signature_request_signed",
    i18nKey: "activity.signatureRequestSigned",
    i18nData: { fullName: data.fullName },
    performedAs: "system",
  })

  revalidatePath(`/task/${taskToken}`)
  if (req.id) revalidatePath(`/admin/requests/${req.id}`)

  return { id, token: sigReq.secureToken }
}

// ─── Partner: per-request-group signature status for a batched task ─────────
// Delivery Batching v2 P4. One entry per request the task's delivery_task_item
// rows touch — never a single shared entry, since a signature_request must
// never cover items from more than one request (see project_koph_delivery_
// batching memory / design doc).

export type BatchSignatureStatus = {
  requestId: string
  requestNumber: string
  sigReq: typeof signatureRequests.$inferSelect | null
  sig: typeof customerSignatures.$inferSelect | null
  signLink: string | null
}

export async function getBatchSignaturesForTaskToken(taskToken: string): Promise<BatchSignatureStatus[]> {
  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.taskToken, taskToken))
  if (!task || task.kind !== "request" || task.requestId) return []

  const affectedRequestIds = await getAffectedRequestIds(task.id)
  const requestRows = await db.select().from(requests).where(inArray(requests.id, affectedRequestIds))

  return Promise.all(
    requestRows.map(async (req) => {
      const [sigReq] = await db
        .select()
        .from(signatureRequests)
        .where(and(eq(signatureRequests.partnerTaskId, task.id), eq(signatureRequests.requestId, req.id)))
        .orderBy(desc(signatureRequests.createdAt))
        .limit(1)

      const sig = sigReq
        ? (await db.select().from(customerSignatures).where(eq(customerSignatures.signatureRequestId, sigReq.id)))[0]
        : undefined

      return {
        requestId: req.id,
        requestNumber: req.requestNumber,
        sigReq: sigReq ?? null,
        sig: sig ?? null,
        signLink: sigReq ? publicUrl(`/sign/${sigReq.secureToken}`) : null,
      }
    })
  )
}

// ─── Partner: sign on-site for ONE request group of a batched task ──────────
// Delivery Batching v2 P4. Same on-site flow as signOnSiteByTaskToken, but for
// a genuine cross-request batch, scoped to exactly one request's items in this
// task. Never touches partner_task.status — a single request's delivery
// outcome must not flip the whole multi-customer trip's status; the courier
// still explicitly marks the whole task done via the normal task actions once
// every stop is complete. requests.status DOES move for the specific request
// (refused → failed, partial → on_hold), mirroring the legacy per-request
// behavior, just narrowed to the one request instead of assumed singular.

export async function signOnSiteForRequestGroup(
  taskToken: string,
  requestId: string,
  data: {
    fullName: string
    nationalId: string
    signatureData: string
    mobile?: string
    position?: string
    deliveryOutcome?: DeliveryOutcome
    remarks?: string
    itemConditions?: {
      requestItemId: string
      condition: "good" | "damaged" | "missing"
      receivedQuantity?: number
    }[]
  }
): Promise<SignatureActionResult> {
  if (!checkRateLimit(`sig-onsite-batch:${taskToken}:${requestId}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.taskToken, taskToken))
  if (!task) return { error: "Task not found" }
  if (task.kind !== "request") {
    return { error: "This task is not a request-kind delivery task" }
  }
  if (task.taskTokenExpiresAt < Date.now()) return { error: "Link expired" }
  if (!["in_progress", "pending_signoff"].includes(task.status)) {
    return { error: "Task is not active for on-site signing" }
  }

  const parsed = signOnSiteSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const group = await loadTaskBatchGroup(task.id, requestId)
  if (!group) return { error: "This request is not part of this task" }
  const groupItemIds = group.items.map((i) => i.id)

  const [req] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!req) return { error: "Request not found" }

  // Find existing pending sig request for THIS (task, request) pair, or
  // auto-create one — never reused across a different request in the batch.
  let [sigReq] = await db
    .select()
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.partnerTaskId, task.id),
        eq(signatureRequests.requestId, requestId),
        eq(signatureRequests.status, "sent")
      )
    )
    .limit(1)

  if (!sigReq) {
    const [existing] = await db
      .select()
      .from(signatureRequests)
      .where(and(eq(signatureRequests.partnerTaskId, task.id), eq(signatureRequests.requestId, requestId)))
      .orderBy(desc(signatureRequests.createdAt))
      .limit(1)

    const isTimeExpired =
      existing?.expiryEnabled && existing.expiresAt ? existing.expiresAt < Date.now() : false
    if (existing && !TERMINAL_SIGNATURE_STATUSES.includes(existing.status) && !isTimeExpired) {
      sigReq = existing
    } else {
      const id = createId()
      const secureToken = generateSecureToken()
      const newVerificationId = generateVerificationId()
      await db.insert(signatureRequests).values({
        id,
        requestId,
        partnerTaskId: task.id,
        initiatedBy: "partner",
        customerId: req.customerId,
        documentName: "Delivery Note",
        secureToken,
        verificationId: newVerificationId,
        requireNationalId: true,
        status: "sent",
      })
      const [created] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
      sigReq = created
    }
  }

  if (!sigReq) return { error: "Could not find or create signature request" }
  if (TERMINAL_SIGNATURE_STATUSES.includes(sigReq.status)) return { error: "This document is already signed or cancelled" }

  // itemConditions supplied by the caller must only reference items actually
  // in this request group's slice of the task — silently dropping anything
  // else would be worse than rejecting the whole request outright.
  if (data.itemConditions?.some((c) => !groupItemIds.includes(c.requestItemId))) {
    return { error: "One or more item conditions do not belong to this request's items on this task" }
  }

  let verificationId = sigReq.verificationId
  if (!verificationId) {
    verificationId = generateVerificationId()
    await db.update(signatureRequests).set({ verificationId }).where(eq(signatureRequests.id, sigReq.id))
  }

  const [customerRow] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, req.customerId))

  const { ipAddress, userAgent } = await captureRequestMeta()
  const now = Date.now()
  const id = createId()
  const fullName = data.fullName.trim()
  const nationalId = data.nationalId.trim()
  const signedAtIso = new Date(now).toISOString()

  const auditDataHash = await buildAuditHash([
    req.requestNumber,
    req.quoteNumber,
    customerRow?.name ?? "",
    fullName,
    nationalId,
    signedAtIso,
    verificationId,
    ipAddress,
    userAgent,
  ])

  const snapshotJson = await buildSnapshotJson({
    requestId,
    requestNumber: req.requestNumber,
    quoteNumber: req.quoteNumber ?? "",
    customerId: req.customerId,
    itemConditions: data.itemConditions,
    deliveryOutcome: data.deliveryOutcome ?? null,
    remarks: data.remarks ?? null,
    signer: { fullName, position: data.position ?? null, nationalId },
    signedAt: now,
    onlyItemIds: groupItemIds,
  })

  const outcome = data.deliveryOutcome ?? null
  const refused = outcome === "refused"
  const sigStatus = refused ? "rejected" : "signed"

  try {
    await db.transaction(async (tx) => {
      assertSigned(await tx
        .update(signatureRequests)
        .set({ status: sigStatus, otpHash: null, otpExpiresAt: null, updatedAt: now })
        .where(and(eq(signatureRequests.id, sigReq.id), eq(signatureRequests.status, sigReq.status))))

      await tx.insert(customerSignatures).values({
        id,
        signatureRequestId: sigReq.id,
        fullName,
        mobile: data.mobile?.trim() ?? "",
        nationalId,
        position: data.position?.trim() || null,
        signatureData: data.signatureData,
        signatureMethod: "electronic",
        deliveryOutcome: outcome,
        remarks: data.remarks?.trim() || null,
        snapshot: snapshotJson,
        consentAcceptedAt: now,
        signedAt: now,
        signedAtTz: "Asia/Riyadh",
        ipAddress,
        userAgent,
        auditDataHash,
      })

      if (data.itemConditions?.length) {
        await tx.insert(signatureItemConditions).values(
          data.itemConditions.map((c) => ({
            id: createId(),
            signatureRequestId: sigReq.id,
            requestItemId: c.requestItemId,
            condition: c.condition,
            receivedQuantity: c.receivedQuantity ?? null,
          }))
        )
      }

      await tx.insert(signatureEvents).values({
        id: createId(),
        signatureRequestId: sigReq.id,
        eventType: refused ? "rejected" : "signed",
      })

      await emitDomainEvent(tx, {
        aggregateType: "signature_request",
        aggregateId: sigReq.id,
        eventType: refused ? "SignatureRejected" : "SignatureCompleted",
        payload: { requestId, signatoryRole: sigReq.signatoryRole },
        dedupeKey: `signature_request:${sigReq.id}:${refused ? "SignatureRejected" : "SignatureCompleted"}`,
      })

      // Request-level transition only, scoped to THIS request — never the
      // task, and never any other request in the batch.
      if (refused) {
        await tx.update(requests).set({ status: "failed", updatedAt: now }).where(eq(requests.id, requestId))
      } else if (outcome === "partial") {
        await tx.update(requests).set({ status: "on_hold", updatedAt: now }).where(eq(requests.id, requestId))
      }
    })
  } catch (e) {
    if (e instanceof StaleSignatureError) return { error: "This document is already signed or cancelled" }
    throw e
  }

  await logActivity({
    entityType: "signature_request",
    entityId: sigReq.id,
    action: "signature_request_signed",
    i18nKey: "activity.signatureRequestSigned",
    i18nData: { fullName: data.fullName },
    performedAs: "system",
  })

  revalidatePath(`/task/${taskToken}`)
  revalidatePath(`/admin/requests/${requestId}`)

  return { id, token: sigReq.secureToken }
}

// ─── Public: reject / decline signature ──────────────────────────────────────

export async function rejectSignature(
  token: string,
  ipAddress?: string
): Promise<SignatureActionResult> {
  if (!checkRateLimit(`sig-reject:${token}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return { error: "Not found" }

  if (TERMINAL_SIGNATURE_STATUSES.includes(sig.status)) return { error: "This request is no longer active" }
  if (sig.status === "draft") return { error: "This link has not been activated yet" }

  await db.transaction(async (tx) => {
    await tx
      .update(signatureRequests)
      .set({ status: "rejected", updatedAt: Date.now() })
      .where(eq(signatureRequests.id, sig.id))

    await tx.insert(signatureEvents).values({
      id: createId(),
      signatureRequestId: sig.id,
      eventType: "rejected",
      ipAddress: ipAddress ?? null,
    })

    await emitDomainEvent(tx, {
      aggregateType: "signature_request",
      aggregateId: sig.id,
      eventType: "SignatureRejected",
      payload: { requestId: sig.requestId ?? null },
      dedupeKey: `signature_request:${sig.id}:SignatureRejected`,
    })
  })

  if (sig.requestId) {
    await logActivity({
      entityType: "signature_request",
      entityId: sig.id,
      action: "signature_request_rejected",
      i18nKey: "activity.signatureRequestRejected",
      performedAs: "system",
    })
    revalidatePath(`/admin/requests/${sig.requestId}`)
  }

  return { id: sig.id }
}

// ─── Manual returned signed receipt (upload → review → approve/reject) ───────
// Preserves the original unsigned printable receipt. The uploaded file is
// pending until an admin approves it; approval is what makes it an accepted
// proof of delivery. Task closure still happens ONLY via admin signOffTask.

export async function uploadManualSignature(
  signatureRequestId: string,
  data: { fileUrl: string; fileName: string; fullName: string; nationalId?: string }
): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const fileUrl = data.fileUrl?.trim()
  const fullName = data.fullName?.trim()
  if (!fileUrl) return { error: "A file is required" }
  if (!fullName) return { error: "Signer name is required" }

  const [sig] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, signatureRequestId))
  if (!sig) return { error: "Signature request not found" }
  if (TERMINAL_SIGNATURE_STATUSES.includes(sig.status)) {
    return { error: "This signature request is no longer active" }
  }

  const now = Date.now()
  const id = createId()
  // One signature row per request — upsert so a rejected upload can be replaced.
  await db
    .insert(customerSignatures)
    .values({
      id,
      signatureRequestId: sig.id,
      fullName,
      mobile: "",
      nationalId: data.nationalId?.trim() || null,
      signatureData: "", // artefact lives in uploadedFileUrl for manual uploads
      signatureMethod: "manual_upload",
      uploadedFileUrl: fileUrl,
      uploadedBy: session.user.id,
      uploadedAt: now,
      approvedBy: null,
      approvedAt: null,
      reviewNotes: null,
      signedAt: now,
      signedAtTz: "Asia/Riyadh",
    })
    .onConflictDoUpdate({
      target: customerSignatures.signatureRequestId,
      set: {
        fullName,
        nationalId: data.nationalId?.trim() || null,
        signatureMethod: "manual_upload",
        uploadedFileUrl: fileUrl,
        uploadedBy: session.user.id,
        uploadedAt: now,
        approvedBy: null,
        approvedAt: null,
        reviewNotes: null,
      },
    })

  await logActivity({
    entityType: "signature_request",
    entityId: sig.id,
    action: "manual_signature_uploaded",
    i18nKey: "activity.manualSignatureUploaded",
    i18nData: { fileName: data.fileName },
    performedBy: session.user.id,
  })

  if (sig.requestId) revalidatePath(`/admin/requests/${sig.requestId}`)
  return { id: sig.id }
}

export async function approveManualSignature(
  signatureRequestId: string,
  data?: { reviewNotes?: string }
): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, signatureRequestId))
  if (!sig) return { error: "Signature request not found" }
  if (TERMINAL_SIGNATURE_STATUSES.includes(sig.status)) {
    return { error: "This signature request is no longer active" }
  }

  const [existing] = await db
    .select()
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, sig.id))
  if (!existing || existing.signatureMethod !== "manual_upload" || !existing.uploadedFileUrl) {
    return { error: "No uploaded file to approve" }
  }
  if (existing.approvedAt) return { error: "Already approved" }

  const now = Date.now()
  // Freeze the receipt as approved (manual uploads carry no outcome → full).
  const snapshotJson = await buildSnapshotJson({
    requestId: sig.requestId,
    requestNumber: "",
    quoteNumber: "",
    customerId: sig.customerId,
    itemConditions: undefined,
    deliveryOutcome: null,
    remarks: null,
    signer: { fullName: existing.fullName, position: existing.position ?? null, nationalId: existing.nationalId },
    signedAt: now,
  })

  try {
    await db.transaction(async (tx) => {
      assertSigned(
        await tx
          .update(signatureRequests)
          .set({ status: "signed", otpHash: null, otpExpiresAt: null, updatedAt: now })
          .where(and(eq(signatureRequests.id, sig.id), eq(signatureRequests.status, sig.status)))
      )

      await tx
        .update(customerSignatures)
        .set({
          approvedBy: session.user.id,
          approvedAt: now,
          reviewNotes: data?.reviewNotes?.trim() || null,
          snapshot: snapshotJson,
          signedAt: now,
        })
        .where(eq(customerSignatures.id, existing.id))

      await tx.insert(signatureEvents).values({
        id: createId(),
        signatureRequestId: sig.id,
        eventType: "signed",
      })

      await emitDomainEvent(tx, {
        aggregateType: "signature_request",
        aggregateId: sig.id,
        eventType: "SignatureCompleted",
        payload: { requestId: sig.requestId ?? null, signatoryRole: sig.signatoryRole },
        dedupeKey: `signature_request:${sig.id}:SignatureCompleted`,
      })

      // Approved manual upload = accepted proof; record signature-received time
      // on the exact delivery task this signature belongs to. Admin sign-off
      // still closes it. requestId-only fallback is legacy-data only (see
      // submitSignature for the same rule).
      if (sig.requestId) {
        await tx
          .update(partnerTasks)
          .set({ signatureReceivedAt: now, updatedAt: now })
          .where(
            sig.partnerTaskId
              ? and(eq(partnerTasks.id, sig.partnerTaskId), isNull(partnerTasks.signatureReceivedAt))
              : and(
                  eq(partnerTasks.requestId, sig.requestId),
                  eq(partnerTasks.status, "pending_signoff"),
                  isNull(partnerTasks.signatureReceivedAt)
                )
          )
      }
    })
  } catch (e) {
    if (e instanceof StaleSignatureError) return { error: "This request is no longer active" }
    throw e
  }

  await logActivity({
    entityType: "signature_request",
    entityId: sig.id,
    action: "manual_signature_approved",
    i18nKey: "activity.manualSignatureApproved",
    performedBy: session.user.id,
  })

  if (sig.requestId) revalidatePath(`/admin/requests/${sig.requestId}`)
  return { id: sig.id }
}

export async function rejectManualSignature(
  signatureRequestId: string,
  data: { reviewNotes: string }
): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const reviewNotes = data.reviewNotes?.trim()
  if (!reviewNotes) return { error: "A rejection reason is required" }

  const [existing] = await db
    .select()
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, signatureRequestId))
  if (!existing || existing.signatureMethod !== "manual_upload") {
    return { error: "No uploaded file to reject" }
  }
  if (existing.approvedAt) return { error: "Cannot reject an approved signature" }

  // Keep the review trail; clear the artefact so a corrected file can be
  // re-uploaded. The unsigned printable receipt is never affected.
  await db
    .update(customerSignatures)
    .set({ uploadedFileUrl: null, reviewNotes })
    .where(eq(customerSignatures.id, existing.id))

  const [sig] = await db
    .select({ requestId: signatureRequests.requestId })
    .from(signatureRequests)
    .where(eq(signatureRequests.id, signatureRequestId))

  await logActivity({
    entityType: "signature_request",
    entityId: signatureRequestId,
    action: "manual_signature_rejected",
    i18nKey: "activity.manualSignatureRejected",
    i18nData: { reason: reviewNotes },
    performedBy: session.user.id,
  })

  if (sig?.requestId) revalidatePath(`/admin/requests/${sig.requestId}`)
  return { id: signatureRequestId }
}

export async function deleteSignatureRequest(id: string): Promise<SignatureActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db
    .select({ requestId: signatureRequests.requestId, status: signatureRequests.status })
    .from(signatureRequests)
    .where(eq(signatureRequests.id, id))
  if (!sig) return { error: "Not found" }

  // Signed records are legal evidence (customer signature + audit hash) — never hard-delete
  if (sig.status === "signed") return { error: "Signed requests cannot be deleted" }

  await db.delete(signatureRequests).where(eq(signatureRequests.id, id))

  revalidatePath("/admin/signatures")
  if (sig.requestId) revalidatePath(`/admin/requests/${sig.requestId}`)
  return { id }
}
