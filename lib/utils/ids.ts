import { customAlphabet } from "nanoid"

// cuid2-style IDs for DB primary keys
export { createId } from "@paralleldrive/cuid2"

// Tracking code: 6 uppercase alphanumeric, human-friendly (no 0/O/I/1)
const trackingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const generateTrackingCode = customAlphabet(trackingAlphabet, 6)
export { generateTrackingCode }

// Task token: 48-char URL-safe random string
const tokenAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
const generateToken = customAlphabet(tokenAlphabet, 48)
export { generateToken }

// Signature secure token: 64-char hex
export function generateSecureToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Verification ID: AUD-XXXXXX (no 0/O/I/1 to avoid misreading)
const auditAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const generateAuditCode = customAlphabet(auditAlphabet, 6)
export function generateVerificationId(): string {
  return "AUD-" + generateAuditCode()
}
