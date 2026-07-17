import { describe, expect, test } from "vitest"
import { statusAfterCustomerConfirmation } from "./order-confirmation"

describe("statusAfterCustomerConfirmation", () => {
  test("customer confirmation moves a draft order into the buying journey", () => {
    expect(statusAfterCustomerConfirmation("draft", "2026-07-17")).toBe("confirmed")
  })

  test("an unconfirmed order remains a draft", () => {
    expect(statusAfterCustomerConfirmation("draft", undefined)).toBe("draft")
  })

  test("editing the date never rolls back an order already in fulfilment", () => {
    expect(statusAfterCustomerConfirmation("partially_fulfilled", undefined)).toBe("partially_fulfilled")
    expect(statusAfterCustomerConfirmation("cancelled", "2026-07-17")).toBe("cancelled")
  })
})
