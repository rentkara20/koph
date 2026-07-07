"use server"

import { checkRateLimit } from "@/lib/utils/rate-limit"
import { desc, eq, and } from "drizzle-orm"
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
  partners,
  partnerTasks,
  requests,
} from "@/lib/db/schema"
import { createId, generateSecureToken, generateVerificationId } from "@/lib/utils/ids"
import { logActivity } from "@/lib/utils/activity"
import { notify, notifyAdmins } from "@/lib/utils/notify"
import { sendEmail } from "@/lib/email/resend"
import { deliveryNoteSignedEmail } from "@/lib/email/templates"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import {
  createSignatureRequestSchema,
  signOnSiteSchema,
  submitSignatureSchema,
  firstError,
} from "@/lib/validation/schemas"

// Statuses from which a signature request can never transition again
const TERMINAL_SIGNATURE_STATUSES = ["signed", "rejected", "cancelled", "expired"]

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

  await db.insert(signatureRequests).values({
    id,
    requestId,
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

  await db
    .update(signatureRequests)
    .set({ status: "cancelled", updatedAt: Date.now() })
    .where(eq(signatureRequests.id, id))

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
    signatureData: string
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

  await db.transaction(async (tx) => {
    await tx.insert(customerSignatures).values({
      id,
      signatureRequestId: sig.id,
      fullName,
      mobile: data.mobile?.trim() ?? "",
      nationalId,
      signatureData: data.signatureData,
      consentVersion: consent?.version ?? null,
      consentAcceptedAt: now,
      signedAt: now,
      signedAtTz: "Asia/Riyadh",
      ipAddress,
      userAgent,
      auditDataHash,
    })

    await tx
      .update(signatureRequests)
      .set({ status: "signed", updatedAt: now })
      .where(eq(signatureRequests.id, sig.id))

    await tx.insert(signatureEvents).values({
      id: createId(),
      signatureRequestId: sig.id,
      eventType: "signed",
      ipAddress,
      userAgent,
    })

    // Per-item acknowledgement of received condition.
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
  const { sig, requestNumber, signerName } = ctx

  // 1) Notify the assigned partner (if they have a portal login) + all admins.
  if (sig.requestId) {
    const [task] = await db
      .select({ partnerId: partnerTasks.partnerId })
      .from(partnerTasks)
      .where(eq(partnerTasks.requestId, sig.requestId))
      .orderBy(desc(partnerTasks.createdAt))
      .limit(1)

    if (task?.partnerId) {
      const [partner] = await db
        .select({ userId: partners.userId })
        .from(partners)
        .where(eq(partners.id, task.partnerId))
      if (partner?.userId) {
        await notify({
          userId: partner.userId,
          type: "customer_signed",
          i18nKey: "notifications.customerSigned",
          i18nData: { customerName: signerName, requestNumber },
          linkUrl: `/admin/requests/${sig.requestId}`,
          entityType: "signature_request",
          entityId: sig.id,
        })
      }
    }

    await notifyAdmins({
      type: "customer_signed",
      i18nKey: "notifications.customerSigned",
      i18nData: { customerName: signerName, requestNumber },
      linkUrl: `/admin/requests/${sig.requestId}`,
      entityType: "signature_request",
      entityId: sig.id,
    })

    // Best-effort email to the customer with the signed delivery note link.
    // No-ops when RESEND_API_KEY isn't configured (see lib/email/resend.ts).
    const [customerRow] = await db
      .select({ name: customers.name, email: customers.email })
      .from(customers)
      .where(eq(customers.id, sig.customerId))
    if (customerRow?.email) {
      const printUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign/${sig.secureToken}/print`
      const { subject, html } = deliveryNoteSignedEmail({
        customerName: customerRow.name,
        requestNumber,
        printUrl,
      })
      await sendEmail({ to: customerRow.email, subject, html })
    }
  }

  // 2) Two-stage signatory chaining.
  if (sig.signatoryRole === "authorized") {
    // Final stage signed → the delivery note is now fully signed.
    if (sig.requestId) {
      await notifyAdmins({
        type: "fully_signed",
        i18nKey: "notifications.fullySigned",
        i18nData: { requestNumber },
        linkUrl: `/admin/requests/${sig.requestId}`,
        entityType: "signature_request",
        entityId: sig.id,
      })
    }
    return
  }

  // Stage-2 (authorised sign-off) is now admin-triggered via
  // requestAuthorizedSignoff — never created automatically here.
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
    signLink: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign/${sigReq.secureToken}`,
  }
}

// ─── Partner: sign on-site using task token ───────────────────────────────────

export async function signOnSiteByTaskToken(
  taskToken: string,
  data: { fullName: string; nationalId: string; signatureData: string }
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

  await db.transaction(async (tx) => {
    await tx.insert(customerSignatures).values({
      id,
      signatureRequestId: sigReq.id,
      fullName,
      mobile: "",
      nationalId,
      signatureData: data.signatureData,
      consentAcceptedAt: now,
      signedAt: now,
      signedAtTz: "Asia/Riyadh",
      ipAddress,
      userAgent,
      auditDataHash,
    })

    await tx
      .update(signatureRequests)
      .set({ status: "signed", updatedAt: now })
      .where(eq(signatureRequests.id, sigReq.id))

    await tx.insert(signatureEvents).values({
      id: createId(),
      signatureRequestId: sigReq.id,
      eventType: "signed",
    })
  })

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
