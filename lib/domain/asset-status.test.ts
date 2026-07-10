import { describe, expect, test } from "vitest"
import {
  actionForTransition,
  assetActionsFor,
  assetStatusAfter,
  canAssetTransition,
  TERMINAL_ASSET_STATUSES,
} from "./asset-status"

describe("canAssetTransition", () => {
  test("allows the normal rental cycle", () => {
    expect(canAssetTransition("in_stock", "reserve")).toBe(true)
    expect(canAssetTransition("reserved", "assign")).toBe(true)
    expect(canAssetTransition("assigned", "deliver")).toBe(true)
    expect(canAssetTransition("delivered", "return")).toBe(true)
    expect(canAssetTransition("returned", "restock")).toBe(true)
  })

  test("blocks skipping steps", () => {
    expect(canAssetTransition("in_stock", "deliver")).toBe(false)
    expect(canAssetTransition("delivered", "assign")).toBe(false)
    expect(canAssetTransition("in_stock", "repair_done")).toBe(false)
  })

  test("terminal states are one-way", () => {
    for (const s of TERMINAL_ASSET_STATUSES) {
      expect(assetActionsFor(s).filter((a) => a !== "sell")).toEqual(
        s === "retired" ? ["sell"].filter((a) => a !== "sell") : []
      )
    }
    expect(canAssetTransition("sold", "restock")).toBe(false)
    expect(canAssetTransition("retired", "restock")).toBe(false)
  })

  test("retired assets can still be sold", () => {
    expect(canAssetTransition("retired", "sell")).toBe(true)
  })

  test("lost assets can be found back into returned", () => {
    expect(canAssetTransition("lost", "found")).toBe(true)
    expect(assetStatusAfter("found")).toBe("returned")
  })

  test("maintenance loop", () => {
    expect(canAssetTransition("returned", "send_maintenance")).toBe(true)
    expect(canAssetTransition("maintenance", "repair_done")).toBe(true)
    expect(assetStatusAfter("repair_done")).toBe("in_stock")
  })
})

describe("assetActionsFor", () => {
  test("in_stock offers the expected actions", () => {
    const actions = assetActionsFor("in_stock")
    expect(actions).toContain("reserve")
    expect(actions).toContain("assign")
    expect(actions).toContain("retire")
    expect(actions).not.toContain("deliver")
    expect(actions).not.toContain("repair_done")
  })

  test("sold offers nothing", () => {
    expect(assetActionsFor("sold")).toEqual([])
  })
})

describe("actionForTransition", () => {
  test("finds the action for a valid (from, to) pair", () => {
    expect(actionForTransition("in_stock", "reserved")).toBe("reserve")
    expect(actionForTransition("assigned", "delivered")).toBe("deliver")
    expect(actionForTransition("maintenance", "in_stock")).toBe("repair_done")
  })

  test("returns null for a pair with no matching action (illegal jump)", () => {
    expect(actionForTransition("in_stock", "delivered")).toBeNull()
    expect(actionForTransition("sold", "in_stock")).toBeNull()
  })

  test("returns null when from === to (not a transition)", () => {
    expect(actionForTransition("in_stock", "in_stock")).toBeNull()
  })
})
