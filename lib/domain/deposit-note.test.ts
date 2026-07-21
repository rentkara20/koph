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

describe("computeDepositTotal", () => {
  it("sums line amounts", () => {
    expect(computeDepositTotal(valid.lines)).toBe(5700)
  })

  it("returns 0 for an empty list", () => {
    expect(computeDepositTotal([])).toBe(0)
  })
})
