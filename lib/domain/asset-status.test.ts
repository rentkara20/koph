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

describe("receiving QC gate", () => {
  test("qc_pass moves receiving_qc → in_stock; qc_fail → damaged", () => {
    expect(canAssetTransition("receiving_qc", "qc_pass")).toBe(true)
    expect(assetStatusAfter("qc_pass")).toBe("in_stock")
    expect(canAssetTransition("receiving_qc", "qc_fail")).toBe(true)
    expect(assetStatusAfter("qc_fail")).toBe("damaged")
  })
  test("receiving_qc assets are not available for rental actions", () => {
    expect(canAssetTransition("receiving_qc", "reserve")).toBe(false)
    expect(canAssetTransition("receiving_qc", "assign")).toBe(false)
    expect(canAssetTransition("receiving_qc", "deliver")).toBe(false)
  })
  test("qc actions apply only to receiving_qc", () => {
    expect(canAssetTransition("in_stock", "qc_pass")).toBe(false)
    expect(canAssetTransition("damaged", "qc_pass")).toBe(false)
  })
})

describe("supplier return lifecycle", () => {
  test("a damaged device can be sent back and confirmed with the supplier", () => {
    expect(canAssetTransition("damaged", "start_supplier_return")).toBe(true)
    expect(assetStatusAfter("start_supplier_return")).toBe("supplier_return_pending")
    expect(canAssetTransition("supplier_return_pending", "confirm_supplier_return")).toBe(true)
    expect(assetStatusAfter("confirm_supplier_return")).toBe("supplier_returned")
  })

  test("supplier-return actions stay inside the guided return form", () => {
    expect(assetActionsFor("damaged")).not.toContain("start_supplier_return")
    expect(assetActionsFor("supplier_return_pending")).not.toContain("confirm_supplier_return")
  })
})

describe("sale-kind lifecycle", () => {
  test("sold serialized product runs in_stock -> assigned -> delivered -> sold", () => {
    expect(canAssetTransition("in_stock", "assign", "sale")).toBe(true)
    expect(canAssetTransition("assigned", "deliver", "sale")).toBe(true)
    // sale completes on delivery: sell is reachable straight from delivered.
    expect(canAssetTransition("delivered", "sell", "sale")).toBe(true)
    expect(assetStatusAfter("sell")).toBe("sold")
  })

  test("sale units never enter rental return-to-pool logic", () => {
    expect(canAssetTransition("delivered", "return", "sale")).toBe(false)
    expect(canAssetTransition("returned", "restock", "sale")).toBe(false)
    expect(canAssetTransition("lost", "found", "sale")).toBe(false)
  })

  test("rental units keep return semantics and cannot sell a delivered unit", () => {
    expect(canAssetTransition("delivered", "return", "rental")).toBe(true)
    // A rental unit out with the customer is not sellable in place.
    expect(canAssetTransition("delivered", "sell", "rental")).toBe(false)
    // Rental default (no kind arg) matches explicit rental.
    expect(canAssetTransition("delivered", "return")).toBe(true)
  })

  test("assetActionsFor(sale) offers sell on delivered but never return", () => {
    const onDelivered = assetActionsFor("delivered", "sale")
    expect(onDelivered).toContain("sell")
    expect(onDelivered).not.toContain("return")
  })
})
