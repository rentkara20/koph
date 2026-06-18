"use server"

import { desc, eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  signatureRequests,
  signatureEvents,
  customerSignatures,
  consentVersions,
  customers,
  partnerTasks,
  requests,
} from "@/lib/db/schema"
import { createId, generateSecureToken } from "@/lib/utils/ids"
import { logActivity } from "@/lib/utils/activity"
import { getSession } from "@/lib/auth/session"

export type SignatureActionResult = { error?: string; id?: string; token?: string }

// ─── Admin: create signature request ─────────────────────────────────────────

export async function createSignatureRequest(
  requestId: string,
  data: {
    documentName: string
    requireNationalId?: boolean
  }
): Promise<SignatureActionResult> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  if (!data.documentName?.trim()) return { error: "Document name is required" }

  const [req] = await db.select().from(requests).where(eq(requests.id, requestId))
  if (!req) return { error: "Request not found" }

  const secureToken = generateSecureToken()
  const id = createId()

  await db.insert(signatureRequests).values({
    id,
    requestId,
    initiatedBy: "admin",
    initiatorId: session.user.id,
    customerId: req.customerId,
    documentName: data.documentName.trim(),
    secureToken,
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
  const session = await getSession()
  if (!session) return []

  return db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.requestId, requestId))
    .orderBy(desc(signatureRequests.createdAt))
}

// ─── Admin: get all signature requests (for list page) ───────────────────────

export async function getAllSignatureRequests() {
  const session = await getSession()
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
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
  if (!sig) return { error: "Not found" }
  if (sig.status !== "draft") return { error: "Only draft requests can be marked as sent" }

  await db
    .update(signatureRequests)
    .set({ status: "sent", updatedAt: Date.now() })
    .where(eq(signatureRequests.id, id))

  await db.insert(signatureEvents).values({
    id: createId(),
    signatureRequestId: id,
    eventType: "sent",
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
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
  if (!sig) return { error: "Not found" }

  const terminal = ["signed", "rejected", "expired", "cancelled"]
  if (terminal.includes(sig.status)) return { error: "Cannot cancel a completed request" }

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
    ipAddress?: string
  }
): Promise<SignatureActionResult> {
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return { error: "Not found" }

  const terminal = ["signed", "rejected", "cancelled", "expired"]
  if (terminal.includes(sig.status)) return { error: "This request is no longer active" }
  if (sig.status === "draft") return { error: "This link has not been activated yet" }
  if (sig.expiryEnabled && sig.expiresAt && sig.expiresAt < Date.now()) {
    return { error: "This signing link has expired" }
  }

  if (!data.fullName?.trim()) return { error: "Full name is required" }
  if (sig.requireNationalId && !data.nationalId?.trim()) {
    return { error: "National ID / Iqama is required" }
  }
  if (!data.signatureData) return { error: "Signature is required" }

  const [consent] = await db
    .select()
    .from(consentVersions)
    .where(eq(consentVersions.isActive, true))
    .limit(1)

  const id = createId()
  const now = Date.now()

  await db.insert(customerSignatures).values({
    id,
    signatureRequestId: sig.id,
    fullName: data.fullName.trim(),
    mobile: data.mobile?.trim() ?? "",
    nationalId: data.nationalId?.trim() || null,
    signatureData: data.signatureData,
    consentVersion: consent?.version ?? null,
    consentAcceptedAt: now,
    signedAt: now,
    ipAddress: data.ipAddress ?? null,
  })

  await db
    .update(signatureRequests)
    .set({ status: "signed", updatedAt: now })
    .where(eq(signatureRequests.id, sig.id))

  await db.insert(signatureEvents).values({
    id: createId(),
    signatureRequestId: sig.id,
    eventType: "signed",
    ipAddress: data.ipAddress ?? null,
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

  return { id }
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
  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, taskToken))

  if (!task) return { error: "Task not found" }
  if (!task.requestId) return { error: "Task has no linked request" }

  if (!data.fullName?.trim()) return { error: "Full name is required" }
  if (!data.nationalId?.trim()) return { error: "National / Iqama ID is required" }
  if (!data.signatureData) return { error: "Signature is required" }

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

    if (existing && !["signed", "cancelled", "expired", "rejected"].includes(existing.status)) {
      sigReq = existing
    } else {
      // Auto-create
      const id = createId()
      const secureToken = generateSecureToken()
      await db.insert(signatureRequests).values({
        id,
        requestId: task.requestId,
        partnerTaskId: task.id,
        initiatedBy: "partner",
        customerId: req.customerId,
        documentName: "Delivery Note",
        secureToken,
        requireNationalId: true,
        status: "sent",
      })
      const [created] = await db.select().from(signatureRequests).where(eq(signatureRequests.id, id))
      sigReq = created
    }
  }

  if (!sigReq) return { error: "Could not find or create signature request" }

  const terminal = ["signed", "rejected", "cancelled", "expired"]
  if (terminal.includes(sigReq.status)) return { error: "This document is already signed or cancelled" }

  const now = Date.now()
  const id = createId()

  await db.insert(customerSignatures).values({
    id,
    signatureRequestId: sigReq.id,
    fullName: data.fullName.trim(),
    mobile: "",
    nationalId: data.nationalId.trim(),
    signatureData: data.signatureData,
    consentAcceptedAt: now,
    signedAt: now,
  })

  await db
    .update(signatureRequests)
    .set({ status: "signed", updatedAt: now })
    .where(eq(signatureRequests.id, sigReq.id))

  await db.insert(signatureEvents).values({
    id: createId(),
    signatureRequestId: sigReq.id,
    eventType: "signed",
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
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.secureToken, token))

  if (!sig) return { error: "Not found" }

  const terminal = ["signed", "rejected", "cancelled", "expired"]
  if (terminal.includes(sig.status)) return { error: "This request is no longer active" }

  await db
    .update(signatureRequests)
    .set({ status: "rejected", updatedAt: Date.now() })
    .where(eq(signatureRequests.id, sig.id))

  await db.insert(signatureEvents).values({
    id: createId(),
    signatureRequestId: sig.id,
    eventType: "rejected",
    ipAddress: ipAddress ?? null,
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
