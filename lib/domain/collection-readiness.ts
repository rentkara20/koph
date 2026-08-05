// Whether a customer order can be collected back right now, independent of any
// rental-end date.
//
// The `scheduleCollection` next-action only fires when rentalEndAt is within 30
// days, and rentalEndAt is derived from rentalPeriodMonths — so every order with
// empty rental months (all legacy ones) had no route to a collection at all.
// This is the manual path: if devices are physically out with the customer,
// collecting them is always a legal thing to ask for. The date-driven action
// stays as the *nudge*; this is the standing *option*.
//
// Kept pure so it is unit-testable and free of DB/i18n concerns.

export type CollectionUnitFacts = {
  status: string
  /** Sale units transfer ownership and never come back — excluded. */
  kind: "rental" | "sale"
}

export type CollectionJobFacts = {
  id: string
  kind: "delivery" | "collection" | "other"
  status: string
}

export type CollectionReadinessFacts = {
  units: CollectionUnitFacts[]
  jobs: CollectionJobFacts[]
}

export type CollectionReadiness = {
  /**
   * available   — devices are out and no collection is running: offer the button.
   * in_progress — a collection job is already open: point at it instead.
   * unavailable — nothing rental is out with the customer.
   */
  state: "available" | "in_progress" | "unavailable"
  /** Rental units currently out with the customer. */
  outCount: number
  /** Open (non-terminal) collection jobs. */
  openCollectionCount: number
  /** The collection job to link to when one is already running. */
  openJobId: string | null
}

// A device is "out" once handed over. `assigned` deliberately does NOT count:
// it means reserved-for-a-trip but still in the warehouse, and the collection
// form looks for delivered units.
const OUT_STATUSES = new Set(["delivered"])
const TERMINAL_JOB_STATUSES = new Set(["completed", "cancelled", "failed"])

export function deriveCollectionReadiness(facts: CollectionReadinessFacts): CollectionReadiness {
  const outCount = facts.units.filter((u) => u.kind === "rental" && OUT_STATUSES.has(u.status)).length
  const openCollections = facts.jobs.filter(
    (j) => j.kind === "collection" && !TERMINAL_JOB_STATUSES.has(j.status)
  )
  const openCollectionCount = openCollections.length

  // An already-completed collection does not block a second one: partial
  // returns are normal, and whatever is still "delivered" still has to come
  // back. Only an *open* collection job suppresses the offer.
  const state: CollectionReadiness["state"] =
    outCount === 0 ? "unavailable" : openCollectionCount > 0 ? "in_progress" : "available"

  return { state, outCount, openCollectionCount, openJobId: openCollections[0]?.id ?? null }
}
