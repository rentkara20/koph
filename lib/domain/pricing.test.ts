import { describe, it, expect } from "vitest"
import { computePayment, isFlatPricing, requiresQuantity } from "./pricing"

describe("isFlatPricing", () => {
  it("treats per_order and fixed as flat", () => {
    expect(isFlatPricing("per_order")).toBe(true)
    expect(isFlatPricing("fixed")).toBe(true)
  })
  it("treats per_item/per_day/per_hour as non-flat", () => {
    expect(isFlatPricing("per_item")).toBe(false)
    expect(isFlatPricing("per_day")).toBe(false)
    expect(isFlatPricing("per_hour")).toBe(false)
  })
})

describe("requiresQuantity", () => {
  it("is false for flat models, true otherwise", () => {
    expect(requiresQuantity("per_order")).toBe(false)
    expect(requiresQuantity("fixed")).toBe(false)
    expect(requiresQuantity("per_item")).toBe(true)
    expect(requiresQuantity("per_day")).toBe(true)
    expect(requiresQuantity("per_hour")).toBe(true)
  })
})

describe("computePayment", () => {
  it("flat models bill once regardless of quantity", () => {
    expect(computePayment("per_order", 150, 20)).toEqual({ quantity: 1, totalAmount: 150 })
    expect(computePayment("fixed", 300, undefined)).toEqual({ quantity: 1, totalAmount: 300 })
  })

  it("per-unit models multiply by quantity", () => {
    expect(computePayment("per_item", 25, 20)).toEqual({ quantity: 20, totalAmount: 500 })
    expect(computePayment("per_day", 100, 3)).toEqual({ quantity: 3, totalAmount: 300 })
  })

  it("defaults per-unit quantity to 1 when omitted (documents current behavior)", () => {
    expect(computePayment("per_item", 25)).toEqual({ quantity: 1, totalAmount: 25 })
  })

  it("handles zero quantity as 0 total (falls back to 1 only when undefined)", () => {
    // quantity 0 is falsy but explicitly provided → 0 units, 0 total
    expect(computePayment("per_item", 25, 0)).toEqual({ quantity: 0, totalAmount: 0 })
  })

  it("handles decimal unit prices", () => {
    expect(computePayment("per_hour", 12.5, 4)).toEqual({ quantity: 4, totalAmount: 50 })
  })
})
