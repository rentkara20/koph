// Pure sign-off gate decision, extracted from signOffTask so the payment gate
// is unit-testable. Admin sign-off is the SOLE action that closes a task and
// creates partner payment — this decides whether that is currently allowed.
//
// The payment gate is "admin-approved proof that physical delivery occurred".
// Accepted proof (on-site receiver signature, remote e-signature, approved
// manual upload, or another task-rule-allowed proof) is surfaced as
// `hasAcceptedProof`. An explicit partial/refused outcome is positive evidence
// that delivery did NOT complete in full and blocks close regardless of the
// proof-enforcement flag. Authorised stage-2 sign-off is documentation-only and
// is never part of this decision.

import type { DeliveryOutcome } from "@/lib/domain/signature-snapshot"

export type SignoffInput = {
  isOverride: boolean
  // True only when proof enforcement is enabled AND the resolved proof config
  // requires a signature for this request type.
  requiresSignature: boolean
  hasAcceptedProof: boolean
  // Outcome of the latest signed (accepted) receiver signature, if any.
  latestSignedOutcome: DeliveryOutcome | null
}

export type SignoffDecision =
  | { ok: true }
  | { ok: false; reason: "signature_required" | "partial_unresolved" | "refused" }

export function canSignOff(input: SignoffInput): SignoffDecision {
  // Admin override rescues a mistakenly-failed task — bypasses every gate.
  if (input.isOverride) return { ok: true }

  // Partial / refused are decisive regardless of the enforcement flag.
  if (input.latestSignedOutcome === "partial") return { ok: false, reason: "partial_unresolved" }
  if (input.latestSignedOutcome === "refused") return { ok: false, reason: "refused" }

  if (input.requiresSignature && !input.hasAcceptedProof) {
    return { ok: false, reason: "signature_required" }
  }

  return { ok: true }
}
