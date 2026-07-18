"use server"

import { and, desc, eq, isNotNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { partnerTasks, signatureEvents, signatureRequests } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { generateOtpCode, hashOtp } from "@/lib/utils/otp-hash"
import { decideOtpVerification } from "@/lib/domain/otp-verification"
import { getDeliveryOtpExpiryMs } from "@/lib/actions/settings"
import { getSessionWithRole } from "@/lib/auth/session"
import { logActivity } from "@/lib/utils/activity"

// Salt secret for OTP hashing. BETTER_AUTH_SECRET is always configured in any
// real environment; the literal fallback only keeps local dev booting.
const OTP_SECRET = process.env.BETTER_AUTH_SECRET ?? "koph-dev-otp-salt"

const TERMINAL = ["signed", "rejected", "cancelled", "expired"]

export type OtpGenerateResult = { error?: string; otp?: string; expiresAt?: number }
export type OtpVerifyResult = { error?: string; ok?: boolean; attemptsLeft?: number }

// ─── Admin: generate / regenerate a delivery OTP ─────────────────────────────
// Returns the plaintext code ONCE to the authenticated admin. Only the salted
// hash is stored. Regenerating overwrites the previous hash (invalidating it).

export async function generateDeliveryOtp(
  signatureRequestId: string
): Promise<OtpGenerateResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, signatureRequestId))
  if (!sig) return { error: "Signature request not found" }
  if (TERMINAL.includes(sig.status)) return { error: "This signature request is no longer active" }

  const code = generateOtpCode()
  const otpHash = await hashOtp(sig.id, code, OTP_SECRET)
  const now = Date.now()
  const expiresAt = now + (await getDeliveryOtpExpiryMs())

  await db
    .update(signatureRequests)
    .set({
      otpEnabled: true,
      otpHash,
      otpExpiresAt: expiresAt,
      otpAttempts: 0,
      otpVerifiedAt: null,
      // Ensure the link is active so the courier's verify path can run.
      status: sig.status === "draft" ? "sent" : sig.status,
      updatedAt: now,
    })
    .where(eq(signatureRequests.id, sig.id))

  await db.insert(signatureEvents).values({
    id: createId(),
    signatureRequestId: sig.id,
    eventType: "otp_sent",
  })

  // Activity log MUST NOT include the plaintext code.
  await logActivity({
    entityType: "signature_request",
    entityId: sig.id,
    action: "delivery_otp_generated",
    i18nKey: "activity.deliveryOtpGenerated",
    performedBy: session.user.id,
  })

  if (sig.requestId) revalidatePath(`/admin/requests/${sig.requestId}`)
  return { otp: code, expiresAt }
}

// ─── Courier (public): verify OTP by task token ──────────────────────────────
// Unlocks the review + signature stage only. NEVER closes the task. Consumes
// nothing on success beyond flipping to otp_verified; single-use is enforced by
// invalidateDeliveryOtp on sign/cancel.

export async function verifyDeliveryOtp(
  taskToken: string,
  code: string,
  // Delivery Batching v2 P4: set only for a genuine cross-request batch, to
  // scope the OTP lookup to this one request's own signature request instead
  // of the (nonexistent, for a batch) single task-wide one.
  requestId?: string
): Promise<OtpVerifyResult> {
  if (!checkRateLimit(`otp-verify:${taskToken}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const trimmed = (code ?? "").trim()
  if (!/^\d{6}$/.test(trimmed)) return { error: "Enter the 6-digit code" }

  const [task] = await db
    .select({ id: partnerTasks.id, requestId: partnerTasks.requestId, expiresAt: partnerTasks.taskTokenExpiresAt })
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, taskToken))
  if (!task) return { error: "Task not found" }
  if (task.expiresAt < Date.now()) return { error: "Link expired" }
  const scopedRequestId = requestId ?? task.requestId
  if (!scopedRequestId) return { error: "Task has no linked request" }

  // The active delivery signature request carrying an OTP for this request —
  // scoped to this task's own signature request when a batch requestId is
  // given, so one request group's OTP can never verify a different group.
  const [sig] = await db
    .select()
    .from(signatureRequests)
    .where(
      requestId
        ? and(
            eq(signatureRequests.partnerTaskId, task.id),
            eq(signatureRequests.requestId, requestId),
            isNotNull(signatureRequests.otpHash)
          )
        : and(eq(signatureRequests.requestId, scopedRequestId), isNotNull(signatureRequests.otpHash))
    )
    .orderBy(desc(signatureRequests.createdAt))
    .limit(1)
  if (!sig || TERMINAL.includes(sig.status)) return { error: "No active verification code. Ask the office to send one." }

  const now = Date.now()
  const decision = await decideOtpVerification(sig, trimmed, now, OTP_SECRET)

  switch (decision.kind) {
    case "already_verified":
      return { ok: true }
    case "expired":
      return { error: "The verification code has expired. Ask the office to send a new one." }
    case "locked":
      return { error: "Too many wrong attempts. Ask the office to send a new code." }
    case "mismatch":
      await db
        .update(signatureRequests)
        .set({ otpAttempts: (sig.otpAttempts ?? 0) + 1, updatedAt: now })
        .where(eq(signatureRequests.id, sig.id))
      return {
        error:
          decision.attemptsLeft > 0
            ? "Incorrect code"
            : "Too many wrong attempts. Ask the office to send a new code.",
        attemptsLeft: decision.attemptsLeft,
      }
    case "verified":
      await db
        .update(signatureRequests)
        .set({ status: "otp_verified", otpVerifiedAt: now, updatedAt: now })
        .where(and(eq(signatureRequests.id, sig.id), eq(signatureRequests.status, sig.status)))
      await db.insert(signatureEvents).values({
        id: createId(),
        signatureRequestId: sig.id,
        eventType: "otp_verified",
      })
      revalidatePath(`/task/${taskToken}`)
      return { ok: true }
  }
}

// ─── Courier (public): is the signature stage unlocked for this task? ─────────

export async function isDeliveryStageUnlocked(taskToken: string, requestId?: string): Promise<boolean> {
  const [task] = await db
    .select({ id: partnerTasks.id, requestId: partnerTasks.requestId })
    .from(partnerTasks)
    .where(eq(partnerTasks.taskToken, taskToken))
  if (!task) return false
  const scopedRequestId = requestId ?? task.requestId
  if (!scopedRequestId) return false

  const [sig] = await db
    .select({ otpEnabled: signatureRequests.otpEnabled, otpVerifiedAt: signatureRequests.otpVerifiedAt })
    .from(signatureRequests)
    .where(
      requestId
        ? and(
            eq(signatureRequests.partnerTaskId, task.id),
            eq(signatureRequests.requestId, requestId),
            isNotNull(signatureRequests.otpHash)
          )
        : and(eq(signatureRequests.requestId, scopedRequestId), isNotNull(signatureRequests.otpHash))
    )
    .orderBy(desc(signatureRequests.createdAt))
    .limit(1)

  // No OTP configured for this delivery → stage is open (OTP is opt-in).
  if (!sig) return true
  return Boolean(sig.otpVerifiedAt)
}
