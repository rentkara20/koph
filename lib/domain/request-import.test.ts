import { describe, expect, it } from "vitest"
import { buildRequestItemsFromOrderUnits } from "./request-import"

describe("buildRequestItemsFromOrderUnits", () => {
  it("turns every available order device into a delivery item while preserving its asset link", () => {
    expect(
      buildRequestItemsFromOrderUnits([
        {
          unitId: "asset-1",
          description: "Laptop",
          brand: "Dell",
          model: null,
          serialNumber: "SER-1",
        },
      ])
    ).toEqual([
      {
        description: "Laptop",
        brand: "Dell",
        model: "",
        serialNumber: "SER-1",
        quantity: 1,
        accessories: "",
        notes: "",
        orderUnitId: "asset-1",
      },
    ])
  })
})
