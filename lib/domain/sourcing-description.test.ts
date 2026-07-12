import { describe, expect, test } from "vitest"
import {
  resolveSupplierDescription,
  isSameDescription,
  applySameAsToggle,
  sourcingRequestDescription,
} from "./sourcing-description"

describe("resolveSupplierDescription", () => {
  test("mirrors customer description when sameAsCustomer is on", () => {
    expect(resolveSupplierDescription(true, "Dell XPS 15", "ignored")).toBe("Dell XPS 15")
  })

  test("keeps the independent supplier value when mirroring is off", () => {
    expect(resolveSupplierDescription(false, "Dell XPS 15", "Dell laptop 15in")).toBe(
      "Dell laptop 15in"
    )
  })
})

describe("isSameDescription", () => {
  test("equal after trim → same", () => {
    expect(isSameDescription("  Dell XPS  ", "Dell XPS")).toBe(true)
  })

  test("different content → not same", () => {
    expect(isSameDescription("Dell XPS", "HP EliteBook")).toBe(false)
  })
})

describe("applySameAsToggle", () => {
  const base = { customerDescription: "Dell XPS", supplierDescription: "old spec", sameAsCustomer: true }

  test("turning OFF freezes the current customer value for independent editing", () => {
    const next = applySameAsToggle(base, false)
    expect(next.sameAsCustomer).toBe(false)
    expect(next.supplierDescription).toBe("Dell XPS")
  })

  test("turning ON leaves the stored supplier value untouched (re-derived at read)", () => {
    const off = { customerDescription: "Dell XPS", supplierDescription: "HP", sameAsCustomer: false }
    const on = applySameAsToggle(off, true)
    expect(on.sameAsCustomer).toBe(true)
    expect(on.supplierDescription).toBe("HP")
    // Re-sync is resolved lazily against the latest customer description.
    expect(resolveSupplierDescription(on.sameAsCustomer, "Dell XPS 2", on.supplierDescription)).toBe(
      "Dell XPS 2"
    )
  })

  test("is pure — does not mutate the input item", () => {
    const input = { ...base }
    applySameAsToggle(input, false)
    expect(input.supplierDescription).toBe("old spec")
  })

  test("independent items keep their own state", () => {
    const items = [
      { customerDescription: "A", supplierDescription: "A", sameAsCustomer: true },
      { customerDescription: "B", supplierDescription: "B", sameAsCustomer: true },
    ]
    const updated = items.map((it, i) => (i === 0 ? applySameAsToggle(it, false) : it))
    expect(updated[0].sameAsCustomer).toBe(false)
    expect(updated[1].sameAsCustomer).toBe(true)
  })
})

describe("sourcingRequestDescription", () => {
  test("prefers non-empty notes", () => {
    expect(
      sourcingRequestDescription({ notes: "note", title: "t", firstItemCustomerDescription: "d" })
    ).toBe("note")
  })

  test("blank/whitespace notes do not win — falls through to title", () => {
    expect(
      sourcingRequestDescription({ notes: "   ", title: "My title", firstItemCustomerDescription: "d" })
    ).toBe("My title")
  })

  test("empty title falls through to first item's customer description", () => {
    expect(
      sourcingRequestDescription({ notes: "", title: "", firstItemCustomerDescription: "Laptop" })
    ).toBe("Laptop")
  })

  test("falls back to request ref, then a safe non-blank sentinel", () => {
    expect(sourcingRequestDescription({ externalRef: "REQ-1" })).toBe("REQ-1")
    expect(sourcingRequestDescription({})).toBe("—")
    expect(sourcingRequestDescription({ notes: "  ", title: null })).toBe("—")
  })
})
