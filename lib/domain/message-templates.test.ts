import { describe, expect, it } from "vitest"
import {
  DEFAULT_OPERATIONAL_TEMPLATES,
  DEFAULT_RFQ_TEMPLATES,
  renderMessageTemplate,
  validateOperationalTemplates,
  validateRfqTemplates,
} from "./message-templates"

describe("renderMessageTemplate", () => {
  it("replaces repeated variables and keeps multiline values", () => {
    const rendered = renderMessageTemplate(
      "Hello {{supplier_name}}\n{{items}}\nRef: {{request_ref}} / {{request_ref}}",
      {
        supplier_name: "Ahmed",
        items: "• 2× Laptop\n• 1× Dock",
        request_ref: "ORD-42",
      }
    )

    expect(rendered).toBe("Hello Ahmed\n• 2× Laptop\n• 1× Dock\nRef: ORD-42 / ORD-42")
  })

  it("renders missing optional values as an empty string", () => {
    expect(renderMessageTemplate("Title: {{request_title}}", { request_title: null })).toBe("Title: ")
  })
})

describe("validateRfqTemplates", () => {
  it("accepts the system defaults", () => {
    expect(validateRfqTemplates(DEFAULT_RFQ_TEMPLATES)).toEqual({})
  })

  it("rejects a WhatsApp template missing the items variable", () => {
    expect(
      validateRfqTemplates({
        ...DEFAULT_RFQ_TEMPLATES,
        whatsappBody: "مرحباً {{supplier_name}} — {{request_ref}}",
      })
    ).toEqual({ error: "WhatsApp template must include {{items}}" })
  })

  it("rejects unknown variables", () => {
    expect(
      validateRfqTemplates({
        ...DEFAULT_RFQ_TEMPLATES,
        emailSubject: "RFQ {{unknown_value}}",
      })
    ).toEqual({ error: "Unknown template variable: {{unknown_value}}" })
  })
})

describe("operational message templates", () => {
  it("uses Arabic for WhatsApp-style messages and English for email defaults", () => {
    expect(DEFAULT_OPERATIONAL_TEMPLATES.customerEnRoute).toContain("أنا في الطريق")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.otpDeliverySubject).toBe("KARA delivery | {{request_number}}")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.otpDeliveryWhatsappBody).toContain("رمز التحقق")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.otpDeliveryEmailBody).toContain("Your order {{request_number}} is ready for delivery")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.remoteSignatureWhatsappBody).toContain("التوقيع")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.remoteSignatureEmailBody).toContain("complete the delivery confirmation")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.signedReceiptWhatsappBody).toContain("سند الاستلام")
    expect(DEFAULT_OPERATIONAL_TEMPLATES.signedReceiptEmailBody).toContain("Your signed delivery receipt")
  })

  it("includes the courier-to-customer delivery message", () => {
    const rendered = renderMessageTemplate(DEFAULT_OPERATIONAL_TEMPLATES.customerEnRoute, {
      customer_name: "محمد",
      courier_name: "أحمد",
      request_number: "REQ-100",
      items: "2× Laptop",
      sign_link: "https://example.test/sign/1",
    })

    expect(rendered).toContain("محمد")
    expect(rendered).toContain("أحمد")
    expect(rendered).toContain("REQ-100")
  })

  it("accepts all system operational defaults", () => {
    expect(validateOperationalTemplates(DEFAULT_OPERATIONAL_TEMPLATES)).toEqual({})
  })

  it("rejects an unknown variable in an operational template", () => {
    expect(
      validateOperationalTemplates({
        ...DEFAULT_OPERATIONAL_TEMPLATES,
        customerEnRoute: "Hello {{not_a_real_variable}}",
      })
    ).toEqual({ error: "Unknown template variable: {{not_a_real_variable}}" })
  })
})
