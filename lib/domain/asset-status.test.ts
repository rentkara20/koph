import { describe, expect, test } from "vitest"
import {
  actionForTransition,
  assetActionsFor,
  assetKindForOrderLineType,
  assetStatusAfter,
  canAssetTransition,
  TERMINAL_ASSET_STATUSES,
} from "./asset-status"

describe("assetKindForOrderLineType", () => {
  test("a sold_product line yields a sale unit", () => {
    expect(assetKindForOrderLineType("sold_product")).toBe("sale")
  })

  test("a rental_asset line yields a rental unit", () => {
    expect(assetKindForOrderLineType("rental_asset")).toBe("rental")
  })

  // Guards the consequence, not just the mapping: a rental unit wrongly stamped
  // "sale" gains delivered -> sold and loses its collection route.
  test("kind decides whether a delivered unit can be sold", () => {
    expect(canAssetTransition("delivered", "sell", assetKindForOrderLineType("sold_product"))).toBe(true)
    expect(canAssetTransition("delivered", "sell", assetKindForOrderLineType("rental_asset"))).toBe(false)
  })
})

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

// Ownership is a second gate on top of kind. It exists to stop us disposing of
// property that is not ours: a customer's laptop we are formatting must never
// be sellable or retirable from the asset page, no matter what status it is in.
describe("ownership gating", () => {
  test("a KARA device keeps the full action set (the default is unchanged)", () => {
    expect(canAssetTransition("in_stock", "sell", "rental", "kara")).toBe(true)
    expect(canAssetTransition("in_stock", "retire", "rental", "kara")).toBe(true)
    // Omitting the argument must behave exactly like passing "kara" — every
    // existing caller relies on that.
    expect(canAssetTransition("in_stock", "sell", "rental")).toBe(true)
  })

  test("a customer-owned device can never be sold or retired by us", () => {
    for (const from of ["in_stock", "returned", "retired"] as const) {
      expect(canAssetTransition(from, "sell", "rental", "customer")).toBe(false)
    }
    for (const from of ["in_stock", "returned", "damaged", "maintenance"] as const) {
      expect(canAssetTransition(from, "retire", "rental", "customer")).toBe(false)
    }
  })

  test("a customer-owned device is never returned to one of our suppliers", () => {
    expect(canAssetTransition("damaged", "start_supplier_return", "rental", "customer")).toBe(false)
    expect(
      canAssetTransition("supplier_return_pending", "confirm_supplier_return", "rental", "customer")
    ).toBe(false)
  })

  test("a supplier-owned device still goes back to the supplier", () => {
    expect(canAssetTransition("damaged", "start_supplier_return", "rental", "supplier")).toBe(true)
    // ...but is not ours to sell or write off either.
    expect(canAssetTransition("in_stock", "sell", "rental", "supplier")).toBe(false)
    expect(canAssetTransition("in_stock", "retire", "rental", "supplier")).toBe(false)
  })

  // The whole point of entering a customer's device: collect it, service it,
  // hand it back. Ownership must not block any of that.
  test("physical movement stays legal for a device we do not own", () => {
    expect(canAssetTransition("in_stock", "assign", "rental", "customer")).toBe(true)
    expect(canAssetTransition("assigned", "deliver", "rental", "customer")).toBe(true)
    expect(canAssetTransition("delivered", "return", "rental", "customer")).toBe(true)
    expect(canAssetTransition("returned", "send_maintenance", "rental", "customer")).toBe(true)
    expect(canAssetTransition("maintenance", "repair_done", "rental", "customer")).toBe(true)
    expect(canAssetTransition("returned", "restock", "rental", "customer")).toBe(true)
  })

  test("assetActionsFor hides what the server would reject", () => {
    const kara = assetActionsFor("in_stock", "rental", "kara")
    expect(kara).toContain("sell")
    expect(kara).toContain("retire")

    const customer = assetActionsFor("in_stock", "rental", "customer")
    expect(customer).not.toContain("sell")
    expect(customer).not.toContain("retire")
    expect(customer).toContain("assign")
  })
})
