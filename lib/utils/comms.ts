// Provider-neutral manual-communication helpers (Phase 0, zero-IT).
//
// The admin prepares a message and sends it by hand through one of four
// channels. No provider API is called — these builders only produce deep links
// / clipboard text that open the sender's own WhatsApp / Outlook / mail client.
//
// SECURITY: an OTP may appear in the prepared message BODY (the admin sends it
// to the recipient on purpose). It must NEVER be written to communication_log,
// logs, or analytics — persist only the recipient + message type, never the body.

import { buildWhatsappUrl } from "@/lib/utils/whatsapp"

export type CommChannel = "whatsapp" | "outlook" | "mailto" | "copy"

// Slugs shared with communication_log.messageType.
export type CommMessageType = "otp_delivery" | "remote_signature" | "signed_receipt"

// ─── Channel deep-link builders ──────────────────────────────────────────────

/** mailto: fallback — opens the OS default mail client. */
export function buildMailtoUrl(email: string, subject: string, body: string): string {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${encodeURIComponent(email)}?${q}`
}

/** Outlook Web (Microsoft 365) compose — primary email channel. */
export function buildOutlookComposeUrl(email: string, subject: string, body: string): string {
  const q =
    `to=${encodeURIComponent(email)}` +
    `&subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  return `https://outlook.office.com/mail/deeplink/compose?${q}`
}

export { buildWhatsappUrl }

// ─── Subjects (email channels) ───────────────────────────────────────────────

export function otpDeliverySubject(requestNumber: string): string {
  return `تسليم كارا — طلب ${requestNumber}`
}
export function remoteSignatureSubject(requestNumber: string): string {
  return `توقيع سند الاستلام — طلب ${requestNumber}`
}
export function signedReceiptSubject(requestNumber: string): string {
  return `تم التسليم — سند الاستلام للطلب ${requestNumber}`
}

// ─── Message bodies (Arabic, KSA) ────────────────────────────────────────────

/** Pre-delivery: OTP + order summary + instructions + secure link. */
export function otpDeliveryMessage(opts: {
  customerName: string | null
  requestNumber: string
  itemsSummary: string
  otp: string
  signLink: string
  instructions?: string | null
}): string {
  const lines = [
    `مرحباً${opts.customerName ? " " + opts.customerName : ""}،`,
    `طلبك رقم ${opts.requestNumber} جاهز للتسليم من شركة حلول كارا للتأجير.`,
    `المحتويات: ${opts.itemsSummary}.`,
    ``,
    `رمز التحقق (OTP) لاستلام الطلب: ${opts.otp}`,
    `يرجى إعطاء هذا الرمز لمندوب التوصيل عند الاستلام للتأكيد والتوقيع.`,
  ]
  if (opts.instructions?.trim()) lines.push(``, `تعليمات: ${opts.instructions.trim()}`)
  lines.push(``, `لمراجعة سند التسليم:`, opts.signLink)
  return lines.join("\n")
}

/** Remote signature request (courier left without a signature). */
export function remoteSignatureMessage(opts: {
  customerName: string | null
  requestNumber: string
  signLink: string
}): string {
  return [
    `مرحباً${opts.customerName ? " " + opts.customerName : ""}،`,
    `تم تسليم طلبك رقم ${opts.requestNumber}. يتبقى توثيق التوقيع.`,
    `يمكنك التوقيع إلكترونياً عبر الرابط الآمن:`,
    opts.signLink,
    ``,
    `أو طباعة السند والتوقيع يدوياً وإعادته بالبريد الإلكتروني.`,
  ].join("\n")
}

/** After-delivery thank-you + signed receipt link. */
export function signedReceiptMessage(opts: {
  customerName: string | null
  requestNumber: string
  receiptLink: string
}): string {
  return [
    `مرحباً${opts.customerName ? " " + opts.customerName : ""}،`,
    `شكراً لك. تم إتمام تسليم طلبك رقم ${opts.requestNumber} بنجاح.`,
    `يمكنك الاطلاع على سند الاستلام الموقّع من الرابط الآمن:`,
    opts.receiptLink,
  ].join("\n")
}
