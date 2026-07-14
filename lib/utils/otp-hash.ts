// Delivery-OTP primitives. The plaintext code is shown to the admin exactly
// once and never stored or logged — only a salted SHA-256 hash is persisted.
//
// The salt binds the hash to a server secret AND the signature-request id, so a
// stored hash is useless without both (and cannot be replayed across requests).

export const OTP_LENGTH = 6
export const OTP_MAX_ATTEMPTS = 5

/** Cryptographically-random, uniformly-distributed 6-digit code (zero-padded). */
export function generateOtpCode(): string {
  const bound = 10 ** OTP_LENGTH // 1_000_000
  const limit = Math.floor(0xffffffff / bound) * bound // rejection-sampling ceiling
  const buf = new Uint32Array(1)
  let n = 0
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= limit)
  return String(n % bound).padStart(OTP_LENGTH, "0")
}

/** Salted SHA-256 hex of the code, bound to the signature-request id + secret. */
export async function hashOtp(
  signatureRequestId: string,
  code: string,
  secret: string
): Promise<string> {
  const text = `${secret}:${signatureRequestId}:${code}`
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Constant-time-ish comparison of two hex hashes. */
export function hashesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
