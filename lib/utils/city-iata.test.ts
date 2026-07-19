import { describe, expect, it } from "vitest"
import { buildDeliveryNoteName, extractDeliveryLocationLabel } from "./city-iata"

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

describe("extractDeliveryLocationLabel", () => {
  it("extracts location and patch from a full document name", () => {
    expect(
      extractDeliveryLocationLabel("Delivery Note #10681 شركة إمدادات المركبة للتجارة, RUH, P1")
    ).toBe("RUH, P1")
  })

  it("returns just the patch when the name has no location slot", () => {
    expect(extractDeliveryLocationLabel("Delivery Note #10681 Al Rajhi Bank, P2")).toBe("P2")
  })

  it("returns null for names without a trailing patch marker", () => {
    expect(extractDeliveryLocationLabel("Delivery Note #10681 Al Rajhi Bank")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(extractDeliveryLocationLabel(null)).toBeNull()
    expect(extractDeliveryLocationLabel(undefined)).toBeNull()
  })
})
