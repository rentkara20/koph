// Derives the cross-module "journey" of a customer order — Order → Sourcing →
// Procurement → Assets → Delivery — from aggregated facts gathered across the
// pipeline tables. Kept pure so it is unit-testable and free of DB/i18n concerns;
// the server action feeds it counts and the UI renders the returned states.

export type JourneyStageKey = "order" | "sourcing" | "procurement" | "assets" | "delivery"

// done: this stage produced its output. active: in progress right now.
// pending: not started (its inputs have not arrived yet).
export type StageState = "done" | "active" | "pending"

export type JourneyStage = {
  key: JourneyStageKey
  state: StageState
  /** Small evidence count shown under the label (e.g. RFQ / unit count). */
  count: number
}

export type OrderJourneyFacts = {
  sourcing: { requestCount: number; anyHandedOff: boolean }
  procurement: { caseCount: number; poCount: number }
  assets: { unitCount: number; deliveredCount: number }
  delivery: { requestCount: number; anyCompleted: boolean }
}

export const JOURNEY_STAGE_ORDER: JourneyStageKey[] = [
  "order",
  "sourcing",
  "procurement",
  "assets",
  "delivery",
]

// ─── Request journey (Mission Control, 9 stages) ────────────────────────────
// Extended derivation for the Request workspace: the same pure-function idea,
// but tracking the full operational life of a customer request from intake to
// closure. Fed by getRequestWorkspace; deriveOrderJourney above stays for the
// legacy 5-stage strip used elsewhere.

export type RequestJourneyStageKey =
  | "requested"
  | "sourcing"
  | "purchasing"
  | "receiving"
  | "ready"
  | "delivery"
  | "active"
  | "collection"
  | "closed"

export type RequestJourneyStage = {
  key: RequestJourneyStageKey
  state: StageState
  /** Small evidence count shown under the label (e.g. received / delivered units). */
  count: number
}

export type RequestJourneyFacts = {
  orderStatus: "draft" | "confirmed" | "partially_fulfilled" | "fulfilled" | "cancelled"
  sourcing: { requestCount: number; anyHandedOff: boolean }
  purchasing: { caseCount: number; poCount: number; orderedQty: number }
  receivedCount: number
  qcPendingCount: number
  inStockCount: number
  unitCount: number
  deliveredUnitCount: number
  returnedUnitCount: number
  deliveryJobCount: number
  anyDeliveryCompleted: boolean
  collectionJobCount: number
  anyCollectionCompleted: boolean
  rentalEndAt: number | null
}

export const REQUEST_JOURNEY_STAGE_ORDER: RequestJourneyStageKey[] = [
  "requested",
  "sourcing",
  "purchasing",
  "receiving",
  "ready",
  "delivery",
  "active",
  "collection",
  "closed",
]

export function deriveRequestJourney(facts: RequestJourneyFacts): RequestJourneyStage[] {
  const isClosed = facts.orderStatus === "fulfilled"

  const sourcingState: StageState =
    facts.sourcing.requestCount === 0
      ? "pending"
      : facts.sourcing.anyHandedOff || facts.purchasing.caseCount > 0
        ? "done"
        : "active"

  const purchasingState: StageState =
    facts.purchasing.caseCount === 0
      ? "pending"
      : facts.purchasing.poCount > 0
        ? "done"
        : "active"

  // Receiving covers PO receipt + QC. Started once anything was ordered or
  // received; done once everything ordered arrived and cleared QC.
  const receivingStarted = facts.purchasing.orderedQty > 0 || facts.receivedCount > 0
  const receivingState: StageState = !receivingStarted
    ? "pending"
    : facts.receivedCount >= facts.purchasing.orderedQty && facts.qcPendingCount === 0
      ? "done"
      : "active"

  // Ready: units sit in stock waiting to go out. Done once delivery started.
  const readyState: StageState =
    facts.deliveryJobCount > 0 || facts.deliveredUnitCount > 0
      ? "done"
      : facts.inStockCount > 0
        ? "active"
        : "pending"

  const deliveryState: StageState =
    facts.deliveryJobCount === 0
      ? "pending"
      : facts.anyDeliveryCompleted && facts.deliveredUnitCount > 0
        ? "done"
        : "active"

  // Active rental: devices are with the customer. Done once collection wraps.
  const rentalDone =
    (facts.anyCollectionCompleted && facts.returnedUnitCount > 0) ||
    (facts.unitCount > 0 && facts.returnedUnitCount >= facts.unitCount)
  const activeState: StageState = rentalDone
    ? "done"
    : facts.deliveredUnitCount > 0
      ? "active"
      : "pending"

  const collectionState: StageState =
    facts.collectionJobCount === 0
      ? "pending"
      : facts.anyCollectionCompleted
        ? "done"
        : "active"

  const closedState: StageState = isClosed ? "done" : "pending"

  return [
    { key: "requested", state: "done", count: 0 },
    { key: "sourcing", state: sourcingState, count: facts.sourcing.requestCount },
    {
      key: "purchasing",
      state: purchasingState,
      count: facts.purchasing.poCount || facts.purchasing.caseCount,
    },
    { key: "receiving", state: receivingState, count: facts.receivedCount },
    { key: "ready", state: readyState, count: facts.inStockCount },
    { key: "delivery", state: deliveryState, count: facts.deliveredUnitCount },
    { key: "active", state: activeState, count: facts.deliveredUnitCount - facts.returnedUnitCount },
    { key: "collection", state: collectionState, count: facts.returnedUnitCount },
    { key: "closed", state: closedState, count: 0 },
  ]
}

export function deriveOrderJourney(facts: OrderJourneyFacts): JourneyStage[] {
  const { sourcing, procurement, assets, delivery } = facts

  const sourcingState: StageState =
    sourcing.requestCount === 0
      ? "pending"
      : sourcing.anyHandedOff || procurement.caseCount > 0
        ? "done"
        : "active"

  const procurementState: StageState =
    procurement.caseCount === 0
      ? "pending"
      : procurement.poCount > 0 && assets.unitCount > 0
        ? "done"
        : "active"

  const assetsState: StageState =
    assets.unitCount === 0 ? "pending" : delivery.requestCount > 0 ? "done" : "active"

  const deliveryState: StageState =
    delivery.requestCount === 0 ? "pending" : delivery.anyCompleted ? "done" : "active"

  return [
    { key: "order", state: "done", count: 0 },
    { key: "sourcing", state: sourcingState, count: sourcing.requestCount },
    { key: "procurement", state: procurementState, count: procurement.poCount || procurement.caseCount },
    { key: "assets", state: assetsState, count: assets.unitCount },
    { key: "delivery", state: deliveryState, count: delivery.requestCount },
  ]
}
