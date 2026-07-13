import { describe, it, expect } from "vitest"
import {
  deriveOrderJourney,
  deriveRequestJourney,
  REQUEST_JOURNEY_STAGE_ORDER,
  type OrderJourneyFacts,
  type RequestJourneyFacts,
} from "./order-journey"

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

describe("deriveRequestJourney", () => {
  const EMPTY_R: RequestJourneyFacts = {
    orderStatus: "confirmed",
    sourcing: { requestCount: 0, anyHandedOff: false },
    purchasing: { caseCount: 0, poCount: 0, orderedQty: 0 },
    receivedCount: 0,
    qcPendingCount: 0,
    inStockCount: 0,
    unitCount: 0,
    deliveredUnitCount: 0,
    returnedUnitCount: 0,
    deliveryJobCount: 0,
    anyDeliveryCompleted: false,
    collectionJobCount: 0,
    anyCollectionCompleted: false,
    rentalEndAt: null,
  }

  const rStateOf = (stages: ReturnType<typeof deriveRequestJourney>, key: string) =>
    stages.find((s) => s.key === key)!.state

  it("returns all 9 stages in order", () => {
    const stages = deriveRequestJourney(EMPTY_R)
    expect(stages.map((s) => s.key)).toEqual(REQUEST_JOURNEY_STAGE_ORDER)
  })

  it("fresh request: requested done, everything else pending", () => {
    const stages = deriveRequestJourney(EMPTY_R)
    expect(rStateOf(stages, "requested")).toBe("done")
    for (const key of REQUEST_JOURNEY_STAGE_ORDER.slice(1)) {
      expect(rStateOf(stages, key)).toBe("pending")
    }
  })

  it("sourcing active with a request, done once handed off", () => {
    const active = deriveRequestJourney({
      ...EMPTY_R,
      sourcing: { requestCount: 1, anyHandedOff: false },
    })
    expect(rStateOf(active, "sourcing")).toBe("active")
    const done = deriveRequestJourney({
      ...EMPTY_R,
      sourcing: { requestCount: 1, anyHandedOff: true },
      purchasing: { caseCount: 1, poCount: 0, orderedQty: 0 },
    })
    expect(rStateOf(done, "sourcing")).toBe("done")
    expect(rStateOf(done, "purchasing")).toBe("active")
  })

  it("receiving active while partially received, done once complete and QC clear", () => {
    const partial = deriveRequestJourney({
      ...EMPTY_R,
      sourcing: { requestCount: 1, anyHandedOff: true },
      purchasing: { caseCount: 1, poCount: 1, orderedQty: 20 },
      receivedCount: 12,
    })
    expect(rStateOf(partial, "purchasing")).toBe("done")
    expect(rStateOf(partial, "receiving")).toBe("active")
    expect(partial.find((s) => s.key === "receiving")!.count).toBe(12)

    const qcHeld = deriveRequestJourney({
      ...EMPTY_R,
      purchasing: { caseCount: 1, poCount: 1, orderedQty: 20 },
      receivedCount: 20,
      qcPendingCount: 3,
    })
    expect(rStateOf(qcHeld, "receiving")).toBe("active")

    const done = deriveRequestJourney({
      ...EMPTY_R,
      purchasing: { caseCount: 1, poCount: 1, orderedQty: 20 },
      receivedCount: 20,
      inStockCount: 20,
      unitCount: 20,
    })
    expect(rStateOf(done, "receiving")).toBe("done")
    expect(rStateOf(done, "ready")).toBe("active")
  })

  it("delivery and active rental follow the units out of the door", () => {
    const delivering = deriveRequestJourney({
      ...EMPTY_R,
      unitCount: 5,
      inStockCount: 2,
      deliveryJobCount: 1,
    })
    expect(rStateOf(delivering, "ready")).toBe("done")
    expect(rStateOf(delivering, "delivery")).toBe("active")

    const rented = deriveRequestJourney({
      ...EMPTY_R,
      unitCount: 5,
      deliveredUnitCount: 5,
      deliveryJobCount: 1,
      anyDeliveryCompleted: true,
    })
    expect(rStateOf(rented, "delivery")).toBe("done")
    expect(rStateOf(rented, "active")).toBe("active")
  })

  it("collection wraps the rental and fulfilled closes it", () => {
    const collected = deriveRequestJourney({
      ...EMPTY_R,
      orderStatus: "fulfilled",
      unitCount: 5,
      deliveredUnitCount: 5,
      returnedUnitCount: 5,
      deliveryJobCount: 1,
      anyDeliveryCompleted: true,
      collectionJobCount: 1,
      anyCollectionCompleted: true,
    })
    expect(rStateOf(collected, "active")).toBe("done")
    expect(rStateOf(collected, "collection")).toBe("done")
    expect(rStateOf(collected, "closed")).toBe("done")
  })

  it("stock-only path: units in stock with no sourcing keeps early stages pending", () => {
    const stages = deriveRequestJourney({
      ...EMPTY_R,
      unitCount: 2,
      inStockCount: 2,
    })
    expect(rStateOf(stages, "sourcing")).toBe("pending")
    expect(rStateOf(stages, "purchasing")).toBe("pending")
    expect(rStateOf(stages, "receiving")).toBe("pending")
    expect(rStateOf(stages, "ready")).toBe("active")
  })
})
