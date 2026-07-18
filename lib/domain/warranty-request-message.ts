// Warranty activation request — outbound message to the warranty provider.
// A warranty request is conceptually the same as an RFQ (see rfq-message.ts):
// we're asking a supplier to act on a list of serials, just for a service
// (activate/register warranty) instead of a physical item. Same bilingual,
// operator-sends-it-themselves pattern (wa.me / mailto), and the wording is
// editable from Settings → Message Templates just like RFQ/operational ones.

import { renderMessageTemplate, type WarrantyRequestMessageTemplates } from "./message-templates"

export type WarrantyRequestMessageItem = {
  serial: string | null
  device: string
}

export type WarrantyRequestMessageInput = {
  supplierContactName: string | null
  warrantyProductName: string
  batchRef: string
  items: WarrantyRequestMessageItem[]
}

function formatItems(items: WarrantyRequestMessageItem[]): string {
  return items.map((item) => `• ${item.serial ?? "—"} — ${item.device}`).join("\n")
}

export function buildWarrantyRequestMessages(
  input: WarrantyRequestMessageInput,
  templates: WarrantyRequestMessageTemplates
) {
  const values = {
    supplier_name: input.supplierContactName?.trim() || "فريق المبيعات",
    batch_ref: input.batchRef,
    warranty_product: input.warrantyProductName,
    items: formatItems(input.items),
    company_name: "KARA Solutions / Rent Kara",
  }

  return {
    whatsappBody: renderMessageTemplate(templates.whatsappBody, values).trim(),
    emailSubject: renderMessageTemplate(templates.emailSubject, values).replace(/\s+/g, " ").trim(),
    emailBody: renderMessageTemplate(templates.emailBody, values).trim(),
  }
}
