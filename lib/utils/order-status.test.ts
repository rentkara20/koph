import { describe, expect, it } from "vitest"
import { deriveOrderStatus } from "./order-status"

describe("deriveOrderStatus", () => {
  it("does not count a device being returned to its supplier as fulfilled to the customer", () => {
    expect(deriveOrderStatus(["in_stock", "supplier_return_pending"], "confirmed")).toBe("confirmed")
    expect(deriveOrderStatus(["delivered", "supplier_returned"], "partially_fulfilled")).toBe("partially_fulfilled")
  })
})
