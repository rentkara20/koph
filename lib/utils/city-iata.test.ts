import { describe, expect, it } from "vitest"
import { buildDeliveryNoteName } from "./city-iata"

describe("buildDeliveryNoteName", () => {
  it("uses the delivery part number assigned to the customer order", () => {
    expect(buildDeliveryNoteName({
      documentNumber: "10101",
      customerName: "Al Rajhi Bank - IT Dept",
      city: "Riyadh",
      deliveryPartNumber: 2,
    })).toBe("Delivery Note #10101 Al Rajhi Bank - IT Dept, RUH, P2")
  })

  it("keeps P1 as the safe default for legacy requests", () => {
    expect(buildDeliveryNoteName({
      documentNumber: "10101",
      customerName: "Al Rajhi Bank - IT Dept",
      city: "الرياض",
    })).toBe("Delivery Note #10101 Al Rajhi Bank - IT Dept, RUH, P1")
  })

  it("keeps the searchable document name in English on every interface locale", () => {
    expect(buildDeliveryNoteName({
      documentNumber: "10101",
      customerName: "Al Rajhi Bank - IT Dept",
      city: "الرياض",
      deliveryPartNumber: 1,
    })).toBe("Delivery Note #10101 Al Rajhi Bank - IT Dept, RUH, P1")
  })
})
