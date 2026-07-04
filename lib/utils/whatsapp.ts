// WhatsApp deep-link helpers (v1 — no Business API yet).
// Builds wa.me links with a pre-filled Arabic message that opens in the
// sender's own WhatsApp. Message templates are the single source of truth so
// admin and partner surfaces send consistent wording.

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? ""

/**
 * Normalises a Saudi mobile number to bare international digits for wa.me.
 * Accepts +966…, 00966…, 05……, or 5…… and returns e.g. "966544909444".
 * Returns null when the input has no usable digits.
 */
export function normalizeSaudiMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("00")) digits = digits.slice(2)
  if (digits.startsWith("966")) return digits
  if (digits.startsWith("0")) digits = digits.slice(1)
  // Local 9-digit form (5XXXXXXXX) → prefix country code
  if (digits.length === 9 && digits.startsWith("5")) return "966" + digits
  return digits
}

/** Builds a wa.me deep link, or null when the number is unusable. */
export function buildWhatsappUrl(
  mobile: string | null | undefined,
  message: string
): string | null {
  const number = normalizeSaudiMobile(mobile)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

// ─── Message templates (Arabic, KSA) ────────────────────────────────────────

export function partnerAssignmentMessage(opts: {
  partnerName: string
  requestNumber: string
  taskLink: string
}): string {
  return [
    `مرحباً ${opts.partnerName}،`,
    `وصلك طلب جديد من كارا رقم ${opts.requestNumber}.`,
    `افتح الرابط لمراجعة التفاصيل والموافقة:`,
    opts.taskLink,
  ].join("\n")
}

export function customerGreetingMessage(opts: {
  courierName: string
  customerName: string | null
  requestNumber: string
  itemsSummary: string
  signLink?: string | null
}): string {
  const lines = [
    `مرحباً${opts.customerName ? " " + opts.customerName : ""}،`,
    `معك ${opts.courierName}، ومعي شحنة من شركة كارا (طلب رقم ${opts.requestNumber}).`,
    `المحتويات: ${opts.itemsSummary}.`,
    `متى الموعد المناسب لاستلامها؟`,
  ]
  if (opts.signLink) {
    lines.push(``, `للتوقيع على الاستلام:`, opts.signLink)
  }
  return lines.join("\n")
}

export function signLinkMessage(opts: {
  customerName: string | null
  requestNumber: string
  signLink: string
}): string {
  return [
    `مرحباً${opts.customerName ? " " + opts.customerName : ""}،`,
    `يرجى مراجعة سند التسليم للطلب رقم ${opts.requestNumber} والتوقيع عليه من الرابط:`,
    opts.signLink,
  ].join("\n")
}

// ─── Link builders ──────────────────────────────────────────────────────────

export const taskLink = (token: string) => `${appUrl()}/task/${token}`
export const signLink = (token: string) => `${appUrl()}/sign/${token}`
