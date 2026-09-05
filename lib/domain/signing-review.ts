// The gate between drawing a signature and submitting a delivery.
//
// Drawing is not consent: the signer reviews their details, the items and the
// signature, then ticks an explicit acknowledgement. This lives here rather
// than inside the component so the rule is testable on its own and cannot be
// weakened by an accidental edit to a `disabled` attribute — the review step
// asks this function both for the button state and again before submitting.

export type SigningReviewState = {
  signatureData: string | null
  consentAccepted: boolean
  fullName: string
  nationalId: string
}

export type SigningReviewBlocker =
  | "missing_signature"
  | "missing_consent"
  | "missing_name"
  | "missing_national_id"

// Ordered so the signer is sent back to the earliest thing they still need to
// fix rather than the last one checked.
export function signingReviewBlocker(state: SigningReviewState): SigningReviewBlocker | null {
  if (!state.fullName.trim()) return "missing_name"
  if (!state.nationalId.trim()) return "missing_national_id"
  if (!state.signatureData) return "missing_signature"
  if (!state.consentAccepted) return "missing_consent"
  return null
}

export function canSubmitSignature(state: SigningReviewState): boolean {
  return signingReviewBlocker(state) === null
}
