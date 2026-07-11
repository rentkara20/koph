import { describe, expect, test } from "vitest"
import {
  computeBadges,
  lineTotal,
  normalizedUnitPrice,
  type ComparisonLine,
} from "./sourcing-comparison"

function line(partial: Partial<ComparisonLine> & { quotationLineId: string }): ComparisonLine {
  return {
    currency: "SAR",
    unitPrice: null,
    taxRate: null,
    qty: 1,
    upgradesCost: null,
    leadTimeDays: null,
    ...partial,
  }
}

describe("normalizedUnitPrice", () => {
  test("applies tax rate", () => {
    expect(normalizedUnitPrice(100, 15)).toBeCloseTo(115)
  })
  test("treats null tax as zero", () => {
    expect(normalizedUnitPrice(100, null)).toBeCloseTo(100)
  })
  test("returns null when price is null", () => {
    expect(normalizedUnitPrice(null, 15)).toBeNull()
  })
})

describe("lineTotal", () => {
  test("multiplies tax-inclusive unit by qty and adds upgrade cost", () => {
    expect(lineTotal(line({ quotationLineId: "l", unitPrice: 100, taxRate: 15, qty: 10, upgradesCost: 50 }))).toBeCloseTo(1200)
  })
  test("null price yields null total", () => {
    expect(lineTotal(line({ quotationLineId: "l", unitPrice: null }))).toBeNull()
  })
})

describe("computeBadges", () => {
  test("cheapest is lowest tax-inclusive total, fastest is lowest lead time", () => {
    const lines = [
      line({ quotationLineId: "a", unitPrice: 100, taxRate: 15, qty: 1, leadTimeDays: 20 }), // 115
      line({ quotationLineId: "b", unitPrice: 80, taxRate: 0, qty: 1, leadTimeDays: 30 }), // 80  (cheapest)
      line({ quotationLineId: "c", unitPrice: 95, taxRate: 0, qty: 1, leadTimeDays: 7 }), // 95, fastest
    ]
    const badges = computeBadges(lines)
    expect(badges.cheapestLineId).toBe("b")
    expect(badges.fastestLineId).toBe("c")
  })

  test("cheapest respects upgrade cost in the total", () => {
    const lines = [
      line({ quotationLineId: "a", unitPrice: 100, taxRate: 0, qty: 1, upgradesCost: 0 }),
      line({ quotationLineId: "b", unitPrice: 90, taxRate: 0, qty: 1, upgradesCost: 30 }),
    ]
    expect(computeBadges(lines).cheapestLineId).toBe("a") // 100 < 120
  })

  test("cheapest is decided only within the dominant currency", () => {
    const lines = [
      line({ quotationLineId: "sar1", currency: "SAR", unitPrice: 400, taxRate: 0, qty: 1 }),
      line({ quotationLineId: "sar2", currency: "SAR", unitPrice: 380, taxRate: 0, qty: 1 }),
      line({ quotationLineId: "usd1", currency: "USD", unitPrice: 50, taxRate: 0, qty: 1 }),
    ]
    // USD 50 is numerically lowest but SAR dominates (2 lines) → cheapest stays SAR
    expect(computeBadges(lines).cheapestLineId).toBe("sar2")
  })

  test("ignores unpriced lines for cheapest but still ranks them for fastest", () => {
    const lines = [
      line({ quotationLineId: "a", unitPrice: null, leadTimeDays: 3 }),
      line({ quotationLineId: "b", unitPrice: 100, taxRate: 0, leadTimeDays: 10 }),
    ]
    const badges = computeBadges(lines)
    expect(badges.cheapestLineId).toBe("b")
    expect(badges.fastestLineId).toBe("a")
  })

  test("all-unpriced yields null cheapest", () => {
    expect(computeBadges([line({ quotationLineId: "a" })]).cheapestLineId).toBeNull()
  })
})
