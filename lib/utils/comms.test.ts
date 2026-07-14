import { describe, it, expect } from "vitest"
import {
  buildMailtoUrl,
  buildOutlookComposeUrl,
  otpDeliveryMessage,
  remoteSignatureMessage,
  signedReceiptMessage,
} from "./comms"

describe("comms channel builders", () => {
  it("builds a mailto url with encoded subject and body", () => {
    const url = buildMailtoUrl("a@b.com", "Order 123", "line1\nline2")
    expect(url.startsWith("mailto:a%40b.com?")).toBe(true)
    expect(url).toContain("subject=Order%20123")
    expect(url).toContain("body=line1%0Aline2")
  })

  it("builds an Outlook Web compose url on the office.com host", () => {
    const url = buildOutlookComposeUrl("a@b.com", "Sub", "Body here")
    expect(url.startsWith("https://outlook.office.com/mail/deeplink/compose?")).toBe(true)
    expect(url).toContain("to=a%40b.com")
    expect(url).toContain("subject=Sub")
    expect(url).toContain("body=Body%20here")
  })
})

describe("comms message templates", () => {
  it("otp delivery message includes the otp and the secure link", () => {
    const msg = otpDeliveryMessage({
      customerName: "أحمد",
      requestNumber: "REQ-1",
      itemsSummary: "لابتوب",
      otp: "482913",
      signLink: "https://x/sign/tok",
      instructions: "اتصل قبل الوصول",
    })
    expect(msg).toContain("482913")
    expect(msg).toContain("REQ-1")
    expect(msg).toContain("https://x/sign/tok")
    expect(msg).toContain("اتصل قبل الوصول")
  })

  it("remote signature message offers electronic and manual options", () => {
    const msg = remoteSignatureMessage({
      customerName: null,
      requestNumber: "REQ-2",
      signLink: "https://x/sign/t2",
    })
    expect(msg).toContain("https://x/sign/t2")
    expect(msg).toContain("يدوياً")
  })

  it("signed receipt message thanks the customer and links the receipt", () => {
    const msg = signedReceiptMessage({
      customerName: "Sara",
      requestNumber: "REQ-3",
      receiptLink: "https://x/sign/t3/print",
    })
    expect(msg).toContain("REQ-3")
    expect(msg).toContain("https://x/sign/t3/print")
  })
})
