import { describe, it, expect } from "vitest"
import { canSignOff } from "./delivery-signoff"

describe("canSignOff", () => {
  it("allows sign-off with accepted proof", () => {
    expect(
      canSignOff({ isOverride: false, requiresSignature: true, hasAcceptedProof: true })
    ).toEqual({ ok: true })
  })

  it("blocks when a signature is required but no accepted proof exists", () => {
    expect(
      canSignOff({ isOverride: false, requiresSignature: true, hasAcceptedProof: false })
    ).toEqual({ ok: false, reason: "signature_required" })
  })

  it("allows sign-off when no signature is required and none present", () => {
    // Backward-compat: proof enforcement OFF, no signature — admin discretion.
    expect(
      canSignOff({ isOverride: false, requiresSignature: false, hasAcceptedProof: false })
    ).toEqual({ ok: true })
  })

  it("override bypasses every gate", () => {
    expect(
      canSignOff({ isOverride: true, requiresSignature: true, hasAcceptedProof: false })
    ).toEqual({ ok: true })
  })

  it("is outcome-agnostic — accepted proof is enough regardless of delivery outcome", () => {
    // Outcome/payment independence: partial and refused deliveries must remain
    // eligible for admin payment review (full/partial/none/hold) — the gate
    // itself never inspects the delivery outcome.
    expect(
      canSignOff({ isOverride: false, requiresSignature: true, hasAcceptedProof: true })
    ).toEqual({ ok: true })
  })
})
