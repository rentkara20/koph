import { describe, expect, it } from "vitest"
import { resolveNextDeliveryPartNumber } from "./delivery-part"

describe("resolveNextDeliveryPartNumber", () => {
  it("increments the highest part for another delivery from the same order", () => {
    expect(resolveNextDeliveryPartNumber({
      requestTypeSlug: "delivery",
      orderReference: "10101",
      highestExistingPart: 1,
    })).toBe(2)
  })

  it("starts the first delivery at P1", () => {
    expect(resolveNextDeliveryPartNumber({
      requestTypeSlug: "delivery",
      orderReference: "10101",
      highestExistingPart: null,
    })).toBe(1)
  })

  it("does not assign a delivery part to collection or unlinked requests", () => {
    expect(resolveNextDeliveryPartNumber({
      requestTypeSlug: "collection",
      orderReference: "10101",
      highestExistingPart: 4,
    })).toBeNull()
    expect(resolveNextDeliveryPartNumber({
      requestTypeSlug: "delivery",
      orderReference: " ",
      highestExistingPart: null,
    })).toBeNull()
  })
})
