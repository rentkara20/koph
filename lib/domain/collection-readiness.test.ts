import { describe, expect, test } from "vitest"
import { deriveCollectionReadiness } from "./collection-readiness"

const rental = (status: string) => ({ status, kind: "rental" as const })
const sale = (status: string) => ({ status, kind: "sale" as const })

describe("deriveCollectionReadiness", () => {
  test("offers collection when rental devices are out and nothing is running", () => {
    const r = deriveCollectionReadiness({
      units: [rental("delivered"), rental("delivered")],
      jobs: [{ id: "j1", kind: "delivery", status: "completed" }],
    })
    expect(r.state).toBe("available")
    expect(r.outCount).toBe(2)
  })

  test("does not depend on a rental end date — no date is passed in at all", () => {
    // The whole point of the manual path: legacy orders have no rentalPeriodMonths,
    // so rentalEndAt is null and the date-driven nudge can never fire for them.
    const r = deriveCollectionReadiness({ units: [rental("delivered")], jobs: [] })
    expect(r.state).toBe("available")
  })

  test("ignores sale units — ownership transferred, they never come back", () => {
    const r = deriveCollectionReadiness({
      units: [sale("delivered"), sale("sold")],
      jobs: [],
    })
    expect(r.state).toBe("unavailable")
    expect(r.outCount).toBe(0)
  })

  test("counts only delivered rentals, not warehouse-side statuses", () => {
    const r = deriveCollectionReadiness({
      units: [
        rental("delivered"),
        rental("assigned"), // reserved for a trip, still in the warehouse
        rental("in_stock"),
        rental("returned"),
        rental("retired"),
      ],
      jobs: [],
    })
    expect(r.outCount).toBe(1)
  })

  test("points at the running collection instead of offering a second one", () => {
    const r = deriveCollectionReadiness({
      units: [rental("delivered")],
      jobs: [{ id: "col1", kind: "collection", status: "in_progress" }],
    })
    expect(r.state).toBe("in_progress")
    expect(r.openCollectionCount).toBe(1)
    expect(r.openJobId).toBe("col1")
  })

  test.each(["draft", "assigned", "in_progress", "on_hold", "rescheduled"])(
    "a collection at %s still counts as open",
    (status) => {
      const r = deriveCollectionReadiness({
        units: [rental("delivered")],
        jobs: [{ id: "col1", kind: "collection", status }],
      })
      expect(r.state).toBe("in_progress")
    }
  )

  test.each(["completed", "cancelled", "failed"])(
    "a %s collection does not block a follow-up for what is still out",
    (status) => {
      const r = deriveCollectionReadiness({
        units: [rental("delivered")],
        jobs: [{ id: "col1", kind: "collection", status }],
      })
      expect(r.state).toBe("available")
      expect(r.openCollectionCount).toBe(0)
      expect(r.openJobId).toBeNull()
    }
  )

  test("unavailable when there are no units at all", () => {
    expect(deriveCollectionReadiness({ units: [], jobs: [] }).state).toBe("unavailable")
  })

  test("a mixed order counts only its rental side", () => {
    const r = deriveCollectionReadiness({
      units: [rental("delivered"), sale("sold"), sale("delivered"), rental("returned")],
      jobs: [],
    })
    expect(r.state).toBe("available")
    expect(r.outCount).toBe(1)
  })
})
