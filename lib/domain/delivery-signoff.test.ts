import { describe, it, expect } from "vitest"
import { canSignOff } from "./delivery-signoff"

describe("canSignOff", () => {
  it("allows sign-off with accepted full-receipt proof", () => {
    expect(
      canSignOff({
        isOverride: false,
        requiresSignature: true,
        hasAcceptedProof: true,
        latestSignedOutcome: "full_no_remarks",
      })
    ).toEqual({ ok: true })
  })

  it("allows full_with_remarks", () => {
    expect(
      canSignOff({
        isOverride: false,
        requiresSignature: true,
        hasAcceptedProof: true,
        latestSignedOutcome: "full_with_remarks",
      }).ok
    ).toBe(true)
  })

  it("blocks when a signature is required but no accepted proof exists", () => {
    expect(
      canSignOff({
        isOverride: false,
        requiresSignature: true,
        hasAcceptedProof: false,
        latestSignedOutcome: null,
      })
    ).toEqual({ ok: false, reason: "signature_required" })
  })

  it("blocks a partial delivery regardless of enforcement flag", () => {
    expect(
      canSignOff({
        isOverride: false,
        requiresSignature: false,
        hasAcceptedProof: true,
        latestSignedOutcome: "partial",
      })
    ).toEqual({ ok: false, reason: "partial_unresolved" })
  })

  it("blocks a refused delivery", () => {
    expect(
      canSignOff({
        isOverride: false,
        requiresSignature: false,
        hasAcceptedProof: true,
        latestSignedOutcome: "refused",
      })
    ).toEqual({ ok: false, reason: "refused" })
  })

  it("allows sign-off when no signature is required and none present", () => {
    // Backward-compat: proof enforcement OFF, no signature — admin discretion.
    expect(
      canSignOff({
        isOverride: false,
        requiresSignature: false,
        hasAcceptedProof: false,
        latestSignedOutcome: null,
      })
    ).toEqual({ ok: true })
  })

  it("override bypasses every gate", () => {
    expect(
      canSignOff({
        isOverride: true,
        requiresSignature: true,
        hasAcceptedProof: false,
        latestSignedOutcome: "partial",
      })
    ).toEqual({ ok: true })
  })
})
