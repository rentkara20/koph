import { describe, it, expect } from "vitest"
import { canSubmitSignature, signingReviewBlocker } from "./signing-review"

const complete = {
  signatureData: "data:image/png;base64,iVBORw0KGgo=",
  consentAccepted: true,
  fullName: "محمد أحمد",
  nationalId: "1234567890",
}

describe("signingReviewBlocker", () => {
  it("lets a fully reviewed signature through", () => {
    expect(signingReviewBlocker(complete)).toBeNull()
    expect(canSubmitSignature(complete)).toBe(true)
  })

  // The point of the review step: a drawn signature on its own is not consent.
  it("blocks submission until the acknowledgement is ticked", () => {
    const undeclared = { ...complete, consentAccepted: false }
    expect(signingReviewBlocker(undeclared)).toBe("missing_consent")
    expect(canSubmitSignature(undeclared)).toBe(false)
  })

  it("blocks submission when nothing has been drawn", () => {
    expect(signingReviewBlocker({ ...complete, signatureData: null })).toBe("missing_signature")
  })

  it("blocks submission on a blank name", () => {
    expect(signingReviewBlocker({ ...complete, fullName: "   " })).toBe("missing_name")
  })

  it("blocks submission on a blank national ID", () => {
    expect(signingReviewBlocker({ ...complete, nationalId: "" })).toBe("missing_national_id")
  })

  // Consent ticked earlier must not survive the signature being cleared.
  it("reports the signature, not the consent, when both are missing", () => {
    expect(
      signingReviewBlocker({ ...complete, signatureData: null, consentAccepted: false })
    ).toBe("missing_signature")
  })
})
