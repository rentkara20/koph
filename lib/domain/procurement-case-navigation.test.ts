import { describe, expect, it } from "vitest"
import { procurementCaseHref } from "./procurement-case-navigation"

describe("procurementCaseHref", () => {
  it("opens the procurement case route rather than treating the case as a purchase order", () => {
    expect(procurementCaseHref("case/with spaces")).toBe(
      "/admin/procurement/cases/case%2Fwith%20spaces"
    )
  })
})
