// Pure sign-off gate decision, extracted from signOffTask so the payment gate
// is unit-testable. Admin sign-off is the SOLE action that closes a task and
// creates partner payment — this decides whether that is currently allowed.
//
// The gate is outcome-agnostic: customer delivery outcome (full/partial/
// refused/unavailable/rescheduled) never blocks sign-off. Partial and refused
// deliveries remain fully eligible for admin payment review (full, partial,
// none, or hold) — outcome and payment are independent concerns. The gate is
// only "admin-approved proof that the delivery visit occurred", surfaced as
// `hasAcceptedProof`. Authorised stage-2 sign-off is documentation-only and is
// never part of this decision.

export type SignoffInput = {
  isOverride: boolean
  // True only when proof enforcement is enabled AND the resolved proof config
  // requires a signature for this request type.
  requiresSignature: boolean
  hasAcceptedProof: boolean
}

export type SignoffDecision = { ok: true } | { ok: false; reason: "signature_required" }

export function canSignOff(input: SignoffInput): SignoffDecision {
  // Admin override rescues a mistakenly-failed task — bypasses every gate.
  if (input.isOverride) return { ok: true }

  if (input.requiresSignature && !input.hasAcceptedProof) {
    return { ok: false, reason: "signature_required" }
  }

  return { ok: true }
}
