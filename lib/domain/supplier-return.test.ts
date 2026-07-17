import { describe, expect, it } from "vitest"
import { hasUnresolvedSupplierReturns, supplierReturnStatusAfter } from "./supplier-return"

describe("supplierReturnStatusAfter", () => {
  it("waits for a replacement after the supplier receives a replacement return", () => {
    expect(supplierReturnStatusAfter("requested", "confirm_returned", "replacement")).toBe("awaiting_replacement")
  })

  it("resolves a refund after the supplier receives the device", () => {
    expect(supplierReturnStatusAfter("requested", "confirm_returned", "refund")).toBe("resolved")
  })

  it("records receipt of a replacement only from the waiting state", () => {
    expect(supplierReturnStatusAfter("awaiting_replacement", "receive_replacement", "replacement")).toBe("replacement_received")
    expect(() => supplierReturnStatusAfter("requested", "receive_replacement", "replacement")).toThrow(/invalid/i)
  })

  it("keeps procurement open while a return or replacement is outstanding", () => {
    expect(hasUnresolvedSupplierReturns([{ status: "requested" }])).toBe(true)
    expect(hasUnresolvedSupplierReturns([{ status: "awaiting_replacement" }])).toBe(true)
    expect(hasUnresolvedSupplierReturns([{ status: "replacement_received" }])).toBe(false)
    expect(hasUnresolvedSupplierReturns([{ status: "resolved" }])).toBe(false)
  })
})
