import { describe, test, expect } from "vitest"
import { sumBatchTotal, type PaymentLike } from "./payments"

describe("sumBatchTotal", () => {
  test("sums batched and paid line items", () => {
    const payments: PaymentLike[] = [
      { totalAmount: 100, status: "batched" },
      { totalAmount: 50, status: "paid" },
    ]
    expect(sumBatchTotal(payments)).toBe(150)
  })

  test("excludes held items from the total (the OI-0 desync bug)", () => {
    const payments: PaymentLike[] = [
      { totalAmount: 100, status: "batched" },
      { totalAmount: 40, status: "on_hold" },
    ]
    expect(sumBatchTotal(payments)).toBe(100)
  })

  test("excludes pending (unbatched) items", () => {
    const payments: PaymentLike[] = [
      { totalAmount: 100, status: "batched" },
      { totalAmount: 30, status: "pending" },
    ]
    expect(sumBatchTotal(payments)).toBe(100)
  })

  test("empty batch totals zero", () => {
    expect(sumBatchTotal([])).toBe(0)
  })
})
