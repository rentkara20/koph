import { describe, it, expect } from "vitest"
import {
  parseDepositNote,
  computeDepositTotal,
  DEFAULT_DEPOSIT_CURRENCY,
  DEFAULT_DEPOSIT_TITLE,
  type DepositNote,
} from "./deposit-note"

const valid: DepositNote = {
  version: 1,
  enabled: true,
  currency: DEFAULT_DEPOSIT_CURRENCY,
  title: DEFAULT_DEPOSIT_TITLE,
  showTotal: true,
  showRefundTerms: true,
  lines: [
    { itemId: "i1", label: "Laptop — Dell X · SN1", amount: 4500 },
    { itemId: "i2", label: "Monitor — LG · SN2", amount: 1200 },
  ],
  note: "Refundable on return in good condition.",
  settlement: null,
  settledAt: null,
  settlementNote: null,
}

describe("parseDepositNote", () => {
  it("parses a valid enabled note round-tripped through JSON", () => {
    const parsed = parseDepositNote(JSON.stringify(valid))
    expect(parsed).not.toBeNull()
    expect(parsed?.currency).toBe("SAR")
    expect(parsed?.lines).toHaveLength(2)
    expect(parsed?.lines[0].amount).toBe(4500)
  })

  it("returns null for absent input", () => {
    expect(parseDepositNote(null)).toBeNull()
    expect(parseDepositNote(undefined)).toBeNull()
    expect(parseDepositNote("")).toBeNull()
  })

  it("returns null for malformed JSON or bad shape", () => {
    expect(parseDepositNote("not json")).toBeNull()
    expect(parseDepositNote(JSON.stringify({ enabled: true }))).toBeNull()
    expect(
      parseDepositNote(JSON.stringify({ ...valid, lines: [{ itemId: "x", label: "y", amount: -1 }] }))
    ).toBeNull()
  })

  it("returns null when disabled so nothing renders", () => {
    expect(parseDepositNote(JSON.stringify({ ...valid, enabled: false }))).toBeNull()
  })

  it("returns null on version mismatch", () => {
    expect(parseDepositNote(JSON.stringify({ ...valid, version: 2 }))).toBeNull()
  })
})

describe("deposit settlement", () => {
  it("round-trips a settlement recorded on a collection receipt", () => {
    const settled = parseDepositNote(
      JSON.stringify({
        ...valid,
        settlement: "refunded_outside",
        settledAt: 1_760_000_000_000,
        settlementNote: "Bank transfer ref 8842",
      })
    )
    expect(settled?.settlement).toBe("refunded_outside")
    expect(settled?.settledAt).toBe(1_760_000_000_000)
    expect(settled?.settlementNote).toBe("Bank transfer ref 8842")
  })

  it("defaults the settlement fields to null on notes stored before they existed", () => {
    // No migration backfilled these — every historical delivery note is JSON
    // without the keys, and must still parse rather than render nothing.
    const legacy = {
      version: 1,
      enabled: true,
      currency: "SAR",
      title: "Deposit",
      showTotal: true,
      showRefundTerms: true,
      lines: [{ itemId: "i1", label: "Laptop", amount: 4500 }],
      note: null,
    }
    const parsed = parseDepositNote(JSON.stringify(legacy))
    expect(parsed).not.toBeNull()
    expect(parsed?.settlement).toBeNull()
    expect(parsed?.settledAt).toBeNull()
    expect(parsed?.settlementNote).toBeNull()
  })

  it("rejects a settlement value outside the allowed set", () => {
    expect(parseDepositNote(JSON.stringify({ ...valid, settlement: "eaten" }))).toBeNull()
  })
})

describe("computeDepositTotal", () => {
  it("sums line amounts", () => {
    expect(computeDepositTotal(valid.lines)).toBe(5700)
  })

  it("returns 0 for an empty list", () => {
    expect(computeDepositTotal([])).toBe(0)
  })
})
