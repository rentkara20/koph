import { describe, expect, test } from "vitest"
import { buildRfqEmailSubject, buildRfqMessage, buildRfqMessages } from "./rfq-message"
import { DEFAULT_RFQ_TEMPLATES } from "./message-templates"

const ITEMS = [
  { quantity: 10, supplierDescription: "Lenovo ThinkPad L16 Gen1, 32GB", partNumber: "21L16" },
  { quantity: 5, supplierDescription: 'LG 27" 4K monitor', partNumber: null },
]

describe("buildRfqMessage", () => {
  test("includes greeting with contact name, external ref, and every item with qty", () => {
    const msg = buildRfqMessage({
      supplierContactName: "Ahmed",
      externalRef: "NOTION-2093",
      title: "Laptops for Client X",
      items: ITEMS,
    })
    expect(msg).toContain("مرحباً Ahmed،")
    expect(msg).toContain("NOTION-2093")
    expect(msg).toContain("Laptops for Client X")
    expect(msg).toContain("• 10× Lenovo ThinkPad L16 Gen1, 32GB (PN: 21L16)")
    expect(msg).toContain('• 5× LG 27" 4K monitor')
  })

  test("omits part number suffix when item has none", () => {
    const msg = buildRfqMessage({
      supplierContactName: null,
      externalRef: null,
      title: null,
      items: [ITEMS[1]],
    })
    expect(msg).not.toContain("PN:")
  })

  test("falls back to generic greeting and ref-less header", () => {
    const msg = buildRfqMessage({
      supplierContactName: null,
      externalRef: null,
      title: null,
      items: ITEMS,
    })
    expect(msg).toContain("مرحباً،")
    expect(msg).toContain("طلب تسعير / Request for quotation")
  })
})

describe("buildRfqEmailSubject", () => {
  test("includes ref and title when present", () => {
    expect(buildRfqEmailSubject("NOTION-2093", "Laptops")).toBe("RFQ NOTION-2093 — Laptops — Rent Kara")
  })

  test("degrades gracefully without ref/title", () => {
    expect(buildRfqEmailSubject(null, null)).toBe("RFQ — Rent Kara")
  })
})

describe("buildRfqMessages", () => {
  test("uses Arabic WhatsApp and English email defaults", () => {
    const messages = buildRfqMessages(
      {
        supplierContactName: "Ahmed",
        externalRef: "ORD-42",
        title: "Office laptops",
        items: ITEMS,
      },
      DEFAULT_RFQ_TEMPLATES
    )

    expect(messages.whatsappBody).toContain("نرجو تزويدنا بعرض سعر")
    expect(messages.emailSubject).toBe("Request for quotation | ORD-42 | Office laptops")
    expect(messages.emailBody).toContain("Please provide your quotation for the following items")
  })

  test("renders independent WhatsApp and email templates", () => {
    const messages = buildRfqMessages(
      {
        supplierContactName: "Ahmed",
        externalRef: "ORD-42",
        title: "Office laptops",
        items: ITEMS,
      },
      {
        ...DEFAULT_RFQ_TEMPLATES,
        whatsappBody: "WA {{supplier_name}}\n{{items}}",
        emailSubject: "EMAIL {{request_ref}}",
        emailBody: "Dear {{supplier_name}}\n{{request_title}}\n{{items}}",
      }
    )

    expect(messages.whatsappBody).toContain("WA Ahmed")
    expect(messages.whatsappBody).not.toContain("Dear")
    expect(messages.emailSubject).toBe("EMAIL ORD-42")
    expect(messages.emailBody).toContain("Dear Ahmed")
    expect(messages.emailBody).toContain("• 10× Lenovo ThinkPad L16 Gen1, 32GB (PN: 21L16)")
  })

  test("uses friendly fallbacks for blank supplier, ref, and title", () => {
    const messages = buildRfqMessages(
      { supplierContactName: null, externalRef: null, title: null, items: ITEMS },
      DEFAULT_RFQ_TEMPLATES
    )

    expect(messages.whatsappBody).toContain("مرحباً فريق المبيعات،")
    expect(messages.whatsappBody).toContain("غير محدد")
  })
})
