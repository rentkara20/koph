import { describe, expect, it } from "vitest"
import { buildRequestItemsFromOrderUnits, expandRequestItemsByUnit } from "./request-import"

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
        orderUnitIds: ["asset-1"],
      },
    ])
  })

  it("collapses identical non-serialized units into one row carrying the unit count", () => {
    const unit = (unitId: string) => ({
      unitId,
      description: "Power Adapter 65W",
      brand: null,
      model: null,
      serialNumber: null,
    })

    const items = buildRequestItemsFromOrderUnits([unit("u1"), unit("u2"), unit("u3")])

    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(3)
    expect(items[0].orderUnitIds).toEqual(["u1", "u2", "u3"])
  })

  it("keeps serialized devices on their own rows", () => {
    const items = buildRequestItemsFromOrderUnits([
      { unitId: "u1", description: "Laptop", brand: null, model: null, serialNumber: "SER-1" },
      { unitId: "u2", description: "Laptop", brand: null, model: null, serialNumber: "SER-2" },
    ])

    expect(items.map((i) => i.orderUnitIds)).toEqual([["u1"], ["u2"]])
  })
})

describe("expandRequestItemsByUnit", () => {
  it("emits one quantity-1 item per linked order unit", () => {
    const expanded = expandRequestItemsByUnit([
      { description: "Adapter", quantity: 3, orderUnitIds: ["u1", "u2", "u3"] },
    ])

    expect(expanded).toEqual([
      { description: "Adapter", quantity: 1, orderUnitId: "u1" },
      { description: "Adapter", quantity: 1, orderUnitId: "u2" },
      { description: "Adapter", quantity: 1, orderUnitId: "u3" },
    ])
  })

  it("passes a manual row through with its typed quantity and no unit link", () => {
    expect(expandRequestItemsByUnit([{ description: "Cable", quantity: 4 }])).toEqual([
      { description: "Cable", quantity: 4 },
    ])
    expect(expandRequestItemsByUnit([{ description: "Cable", quantity: 4, orderUnitIds: [] }])).toEqual([
      { description: "Cable", quantity: 4 },
    ])
  })
})
