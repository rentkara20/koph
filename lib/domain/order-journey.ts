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
