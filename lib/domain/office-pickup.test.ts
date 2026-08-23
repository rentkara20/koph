import { describe, expect, it } from "vitest"
import { decideOfficePickup, type OfficePickupFacts } from "./office-pickup"

const facts = (over: Partial<OfficePickupFacts> = {}): OfficePickupFacts => ({
  requestStatus: "draft",
  requestTypeSlug: "delivery",
  unitStatuses: ["assigned", "assigned"],
  openTaskCount: 0,
  hasSignature: true,
  ...over,
})

describe("decideOfficePickup", () => {
  it("allows a draft delivery whose devices are assigned", () => {
    const d = decideOfficePickup(facts())
    expect(d.allowed).toBe(true)
    expect(d.deliverCount).toBe(2)
    expect(d.withoutSignature).toBe(false)
  })

  it("allows it from any live status, not just draft", () => {
    for (const requestStatus of ["assigned", "in_progress", "on_hold", "rescheduled"]) {
      expect(decideOfficePickup(facts({ requestStatus })).allowed).toBe(true)
    }
  })

  it("flags a handover with no signed receipt without blocking it", () => {
    const d = decideOfficePickup(facts({ hasSignature: false }))
    expect(d.allowed).toBe(true)
    // The caller records this on the asset trail: the paper may arrive later.
    expect(d.withoutSignature).toBe(true)
  })

  it("refuses a request that is already closed", () => {
    for (const requestStatus of ["completed", "cancelled", "failed"]) {
      const d = decideOfficePickup(facts({ requestStatus }))
      expect(d.allowed).toBe(false)
      expect(d.refusal).toBe("ALREADY_CLOSED")
    }
  })

  it("refuses a collection — that brings devices back, it is not a handover", () => {
    const d = decideOfficePickup(facts({ requestTypeSlug: "collection" }))
    expect(d.refusal).toBe("WRONG_TYPE")
  })

  it("refuses when no devices are linked", () => {
    expect(decideOfficePickup(facts({ unitStatuses: [] })).refusal).toBe("NO_DEVICES")
  })

  // Closing over the counter while a courier is out with the same devices would
  // deliver them twice and orphan the partner's task.
  it("refuses while a partner task is still open", () => {
    const d = decideOfficePickup(facts({ openTaskCount: 1 }))
    expect(d.refusal).toBe("OPEN_PARTNER_TASK")
  })

  it("refuses when a device is in no state to be handed over", () => {
    expect(decideOfficePickup(facts({ unitStatuses: ["assigned", "in_stock"] })).refusal).toBe("DEVICES_NOT_READY")
    expect(decideOfficePickup(facts({ unitStatuses: ["maintenance"] })).refusal).toBe("DEVICES_NOT_READY")
  })

  it("tolerates devices already delivered alongside ones that are not", () => {
    const d = decideOfficePickup(facts({ unitStatuses: ["delivered", "assigned"] }))
    expect(d.allowed).toBe(true)
    expect(d.deliverCount).toBe(1)
  })

  it("refuses when every device is already delivered", () => {
    const d = decideOfficePickup(facts({ unitStatuses: ["delivered", "delivered"] }))
    expect(d.allowed).toBe(false)
    expect(d.refusal).toBe("ALREADY_CLOSED")
  })
})
