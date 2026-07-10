import { describe, expect, test } from "vitest"
import { eventTypeForAction, planAssetFieldUpdate } from "./asset-transition-plan"

const NOW = 1_800_000_000_000

describe("planAssetFieldUpdate", () => {
  test("assign sets requestId/customerId from context", () => {
    const plan = planAssetFieldUpdate("assign", { requestId: "r1", customerId: "c1" }, NOW)
    expect(plan).toEqual({ status: "assigned", currentRequestId: "r1", currentCustomerId: "c1" })
  })

  test("assign with no context clears to null rather than leaving undefined", () => {
    const plan = planAssetFieldUpdate("assign", {}, NOW)
    expect(plan.currentRequestId).toBeNull()
    expect(plan.currentCustomerId).toBeNull()
  })

  for (const action of ["restock", "unassign", "return", "repair_done"] as const) {
    test(`${action} clears assignment fields`, () => {
      const plan = planAssetFieldUpdate(action, { requestId: "r1", customerId: "c1" }, NOW)
      expect(plan.currentRequestId).toBeNull()
      expect(plan.currentCustomerId).toBeNull()
    })
  }

  test("deliver leaves assignment fields untouched (undefined = no change)", () => {
    const plan = planAssetFieldUpdate("deliver", { requestId: "r1", customerId: "c1" }, NOW)
    expect(plan.currentRequestId).toBeUndefined()
    expect(plan.currentCustomerId).toBeUndefined()
  })

  test("restock/repair_done reset location to main_warehouse by default", () => {
    expect(planAssetFieldUpdate("restock", {}, NOW).location).toBe("main_warehouse")
    expect(planAssetFieldUpdate("repair_done", {}, NOW).location).toBe("main_warehouse")
  })

  test("restock honors an explicit location override", () => {
    expect(planAssetFieldUpdate("restock", { location: "branch_2" }, NOW).location).toBe("branch_2")
  })

  test("non-restocking actions do not touch location", () => {
    expect(planAssetFieldUpdate("deliver", {}, NOW).location).toBeUndefined()
  })

  test("retire/sell stamp retiredAt and retirementReason", () => {
    const plan = planAssetFieldUpdate("retire", { notes: "end of life" }, NOW)
    expect(plan.retiredAt).toBe(NOW)
    expect(plan.retirementReason).toBe("end of life")
  })

  test("retire without notes stores null reason, not undefined", () => {
    const plan = planAssetFieldUpdate("sell", {}, NOW)
    expect(plan.retiredAt).toBe(NOW)
    expect(plan.retirementReason).toBeNull()
  })

  test("non-retiring actions do not stamp retiredAt", () => {
    expect(planAssetFieldUpdate("deliver", {}, NOW).retiredAt).toBeUndefined()
  })
})

describe("eventTypeForAction", () => {
  test("maps known actions to their semantic event type", () => {
    expect(eventTypeForAction("assign")).toBe("assigned")
    expect(eventTypeForAction("deliver")).toBe("delivered")
    expect(eventTypeForAction("return")).toBe("returned")
    expect(eventTypeForAction("send_maintenance")).toBe("maintenance")
    expect(eventTypeForAction("retire")).toBe("retired")
  })

  test("falls back to status_change for everything else", () => {
    expect(eventTypeForAction("reserve")).toBe("status_change")
    expect(eventTypeForAction("sell")).toBe("status_change")
    expect(eventTypeForAction("mark_damaged")).toBe("status_change")
  })
})
