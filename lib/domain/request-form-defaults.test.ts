import { describe, expect, it } from "vitest"
import { resolveRequestTypeSlug } from "./request-form-defaults"

describe("resolveRequestTypeSlug", () => {
  it("defaults an order-linked request to delivery", () => {
    expect(
      resolveRequestTypeSlug({
        initialOrderNumber: "10101",
      })
    ).toBe("delivery")
  })

  it("keeps an explicitly selected request type", () => {
    expect(
      resolveRequestTypeSlug({
        initialOrderNumber: "10101",
        initialTypeSlug: "collection",
      })
    ).toBe("collection")
  })

  it("does not choose a type for a request that is not linked to an order", () => {
    expect(resolveRequestTypeSlug({})).toBeUndefined()
  })
})
