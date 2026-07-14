// Pure decision logic for delivery-OTP verification, extracted from the server
// action so every security rule (expiry, attempt lockout, single-use, match) is
// unit-testable without a DB or auth session. The action maps the decision to
// DB writes; this function performs no side effects.

import { hashOtp, hashesEqual, OTP_MAX_ATTEMPTS } from "@/lib/utils/otp-hash"

export type OtpRecord = {
  id: string
  otpHash: string | null
  otpExpiresAt: number | null
  otpAttempts: number | null
  otpVerifiedAt: number | null
}

export type OtpDecision =
  | { kind: "already_verified" }
  | { kind: "expired" }
  | { kind: "locked" }
  | { kind: "mismatch"; attemptsLeft: number }
  | { kind: "verified" }

export async function decideOtpVerification(
  sig: OtpRecord,
  code: string,
  now: number,
  secret: string
): Promise<OtpDecision> {
  // Idempotent: already unlocked (e.g. page refresh after a successful verify).
  if (sig.otpVerifiedAt) return { kind: "already_verified" }

  if (sig.otpExpiresAt && sig.otpExpiresAt < now) return { kind: "expired" }

  if ((sig.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) return { kind: "locked" }

  const candidate = await hashOtp(sig.id, code, secret)
  if (!hashesEqual(candidate, sig.otpHash)) {
    const attempts = (sig.otpAttempts ?? 0) + 1
    return { kind: "mismatch", attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts) }
  }

  return { kind: "verified" }
}
