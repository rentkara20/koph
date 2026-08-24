import { describe, it, expect } from "vitest"
import { groupIdenticalItems, type GroupableItem } from "./item-grouping"

const item = (over: Partial<GroupableItem> & { id: string }): GroupableItem => ({
  description: "Adapter",
  brand: null,
  model: null,
  serialNumber: null,
  quantity: 1,
  accessories: null,
  condition: null,
  ...over,
})

describe("groupIdenticalItems", () => {
  it("collapses identical non-serialized rows and sums their quantity", () => {
    const grouped = groupIdenticalItems([item({ id: "a" }), item({ id: "b" }), item({ id: "c" })])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].quantity).toBe(3)
    expect(grouped[0].groupedIds).toEqual(["a", "b", "c"])
  })

  it("never groups rows that carry a serial number", () => {
    const grouped = groupIdenticalItems([
      item({ id: "a", serialNumber: "SN-1" }),
      item({ id: "b", serialNumber: "SN-2" }),
    ])

    expect(grouped.map((g) => g.id)).toEqual(["a", "b"])
    expect(grouped.every((g) => g.quantity === 1)).toBe(true)
  })

  it("keeps rows apart when any display field differs", () => {
    const grouped = groupIdenticalItems([
      item({ id: "a" }),
      item({ id: "b", model: "65W" }),
      item({ id: "c", condition: "damaged" }),
      item({ id: "d", description: "Cable" }),
    ])

    expect(grouped).toHaveLength(4)
  })

  it("matches case- and whitespace-insensitively", () => {
    const grouped = groupIdenticalItems([
      item({ id: "a", description: "Adapter" }),
      item({ id: "b", description: "  adapter " }),
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].quantity).toBe(2)
  })

  it("preserves first-occurrence order and pre-summed quantities", () => {
    const grouped = groupIdenticalItems([
      item({ id: "a", description: "Cable", quantity: 2 }),
      item({ id: "b", description: "Adapter" }),
      item({ id: "c", description: "Cable", quantity: 4 }),
    ])

    expect(grouped.map((g) => [g.description, g.quantity])).toEqual([
      ["Cable", 6],
      ["Adapter", 1],
    ])
  })

  it("returns an empty list unchanged", () => {
    expect(groupIdenticalItems([])).toEqual([])
  })
})
