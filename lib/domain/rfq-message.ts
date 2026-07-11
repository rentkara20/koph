// RFQ outbound message (Sourcing V2 Phase 3). Pure builder — the single
// source of truth for what suppliers receive over WhatsApp / email / copied
// text, so all three channels send identical wording. Bilingual (Arabic
// greeting/closing, specs stay as typed — usually English) because suppliers
// in KSA read both. V1 sends through the operator's own WhatsApp/mail client
// (wa.me / mailto) — no Business API, no SMTP.

export type RfqMessageItem = {
  quantity: number
  supplierDescription: string
  partNumber: string | null
}

export type RfqMessageInput = {
  supplierContactName: string | null
  externalRef: string | null
  title: string | null
  items: RfqMessageItem[]
}

export function buildRfqMessage(input: RfqMessageInput): string {
  const greeting = input.supplierContactName ? `مرحباً ${input.supplierContactName}،` : "مرحباً،"
  const refLine = input.externalRef
    ? `طلب تسعير — مرجع ${input.externalRef} / RFQ — Ref ${input.externalRef}`
    : "طلب تسعير / Request for quotation"

  const lines = [greeting, refLine]
  if (input.title) lines.push(input.title)
  lines.push("", "نرجو تزويدنا بعرض سعر للأصناف التالية / Please quote the following items:", "")
  for (const item of input.items) {
    const pn = item.partNumber ? ` (PN: ${item.partNumber})` : ""
    lines.push(`• ${item.quantity}× ${item.supplierDescription}${pn}`)
  }
  lines.push(
    "",
    "الرجاء ذكر السعر، مدة التوريد، الضمان، والتوفر / Please include price, lead time, warranty, and availability.",
    "شكراً لكم — شركة حلول كارا للتأجير / Rent Kara"
  )
  return lines.join("\n")
}

export function buildRfqEmailSubject(externalRef: string | null, title: string | null): string {
  const ref = externalRef ? ` ${externalRef}` : ""
  const suffix = title ? ` — ${title}` : ""
  return `RFQ${ref}${suffix} — Rent Kara`
}
