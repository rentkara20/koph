import { describe, expect, it } from "vitest"
import { isQcClear, summarizeQcAssets } from "./qc-summary"

describe("summarizeQcAssets", () => {
  it("separates devices waiting for inspection, passed, and failed", () => {
    expect(
      summarizeQcAssets([
        { status: "receiving_qc" },
        { status: "in_stock" },
        { status: "damaged" },
      ])
    ).toEqual({ total: 3, pending: 1, passed: 1, failed: 1, returnedToSupplier: 0 })
  })

  it("treats unavailable post-QC statuses as failed instead of delivery-ready", () => {
    expect(summarizeQcAssets([{ status: "maintenance" }, { status: "lost" }])).toEqual({
      total: 2,
      pending: 0,
      passed: 0,
      failed: 2,
      returnedToSupplier: 0,
    })
  })

  it("does not block delivery after a rejected device was returned to the supplier", () => {
    expect(summarizeQcAssets([{ status: "in_stock" }, { status: "supplier_returned" }])).toEqual({
      total: 2,
      pending: 0,
      passed: 1,
      failed: 0,
      returnedToSupplier: 1,
    })
  })

  it("allows finalization only after every device passed", () => {
    expect(isQcClear({ total: 2, pending: 0, passed: 2, failed: 0, returnedToSupplier: 0 })).toBe(true)
    expect(isQcClear({ total: 2, pending: 0, passed: 1, failed: 1, returnedToSupplier: 0 })).toBe(false)
    expect(isQcClear({ total: 2, pending: 1, passed: 1, failed: 0, returnedToSupplier: 0 })).toBe(false)
  })
})
