import { describe, it, expect } from "vitest"
import { deriveOrderJourney, type OrderJourneyFacts } from "./order-journey"

const EMPTY: OrderJourneyFacts = {
  sourcing: { requestCount: 0, anyHandedOff: false },
  procurement: { caseCount: 0, poCount: 0 },
  assets: { unitCount: 0, deliveredCount: 0 },
  delivery: { requestCount: 0, anyCompleted: false },
}

const stateOf = (stages: ReturnType<typeof deriveOrderJourney>, key: string) =>
  stages.find((s) => s.key === key)!.state

describe("deriveOrderJourney", () => {
  it("marks order done and everything else pending for a fresh order", () => {
    const stages = deriveOrderJourney(EMPTY)
    expect(stateOf(stages, "order")).toBe("done")
    expect(stateOf(stages, "sourcing")).toBe("pending")
    expect(stateOf(stages, "procurement")).toBe("pending")
    expect(stateOf(stages, "assets")).toBe("pending")
    expect(stateOf(stages, "delivery")).toBe("pending")
  })

  it("sourcing is active once a request exists but nothing handed off", () => {
    const stages = deriveOrderJourney({
      ...EMPTY,
      sourcing: { requestCount: 2, anyHandedOff: false },
    })
    expect(stateOf(stages, "sourcing")).toBe("active")
    expect(stages.find((s) => s.key === "sourcing")!.count).toBe(2)
  })

  it("sourcing is done once a procurement case descends from it", () => {
    const stages = deriveOrderJourney({
      ...EMPTY,
      sourcing: { requestCount: 1, anyHandedOff: false },
      procurement: { caseCount: 1, poCount: 0 },
    })
    expect(stateOf(stages, "sourcing")).toBe("done")
    expect(stateOf(stages, "procurement")).toBe("active")
  })

  it("procurement is done once a PO exists and units are registered", () => {
    const stages = deriveOrderJourney({
      ...EMPTY,
      sourcing: { requestCount: 1, anyHandedOff: true },
      procurement: { caseCount: 1, poCount: 1 },
      assets: { unitCount: 3, deliveredCount: 0 },
    })
    expect(stateOf(stages, "procurement")).toBe("done")
    expect(stateOf(stages, "assets")).toBe("active")
  })

  it("assets is done and delivery active once a delivery op exists", () => {
    const stages = deriveOrderJourney({
      sourcing: { requestCount: 1, anyHandedOff: true },
      procurement: { caseCount: 1, poCount: 1 },
      assets: { unitCount: 3, deliveredCount: 0 },
      delivery: { requestCount: 1, anyCompleted: false },
    })
    expect(stateOf(stages, "assets")).toBe("done")
    expect(stateOf(stages, "delivery")).toBe("active")
  })

  it("delivery is done once a linked operation is completed", () => {
    const stages = deriveOrderJourney({
      sourcing: { requestCount: 1, anyHandedOff: true },
      procurement: { caseCount: 1, poCount: 1 },
      assets: { unitCount: 3, deliveredCount: 3 },
      delivery: { requestCount: 1, anyCompleted: true },
    })
    expect(stateOf(stages, "delivery")).toBe("done")
  })

  it("supports a stock-fulfilled order: delivery done while sourcing was never used", () => {
    const stages = deriveOrderJourney({
      ...EMPTY,
      assets: { unitCount: 2, deliveredCount: 2 },
      delivery: { requestCount: 1, anyCompleted: true },
    })
    expect(stateOf(stages, "sourcing")).toBe("pending")
    expect(stateOf(stages, "delivery")).toBe("done")
  })
})
