// Rules for closing a request the customer collected from a KARA office.
//
// A courier delivery is closed by signing off the partner's task. A counter
// handover has no task, so it needs its own closing rule — without one, request
// status stays "draft" forever (deriveRequestStatus has no tasks to derive from)
// and the devices stay "assigned" while physically with the customer.
//
// Pure functions: the caller supplies the facts, this decides whether the
// handover may be recorded and why not.

export const OFFICE_PICKUP_BLOCKED_STATUSES = ["completed", "cancelled", "failed"] as const

export interface OfficePickupFacts {
  requestStatus: string
  requestTypeSlug: string | null
  /** Units linked to the request's items, with their current asset status. */
  unitStatuses: string[]
  /** Live partner tasks on this request — a courier trip in flight. */
  openTaskCount: number
  /** True when a signature (electronic or an approved paper upload) exists. */
  hasSignature: boolean
}

export type OfficePickupRefusal =
  | "ALREADY_CLOSED"
  | "WRONG_TYPE"
  | "NO_DEVICES"
  | "DEVICES_NOT_READY"
  | "OPEN_PARTNER_TASK"

export interface OfficePickupDecision {
  allowed: boolean
  refusal?: OfficePickupRefusal
  /** Units that must move to "delivered". */
  deliverCount: number
  /** True when the handover would be recorded with no signed receipt at all. */
  withoutSignature: boolean
}

// A collection brings devices back; it is not a handover and cannot be closed
// this way. Delivery-shaped work is what a customer can collect over a counter.
const PICKUP_ELIGIBLE_TYPES = ["delivery", "installation", "swap"]

export function decideOfficePickup(facts: OfficePickupFacts): OfficePickupDecision {
  const base = { deliverCount: 0, withoutSignature: !facts.hasSignature }

  if (OFFICE_PICKUP_BLOCKED_STATUSES.includes(facts.requestStatus as (typeof OFFICE_PICKUP_BLOCKED_STATUSES)[number])) {
    return { ...base, allowed: false, refusal: "ALREADY_CLOSED" }
  }
  if (!facts.requestTypeSlug || !PICKUP_ELIGIBLE_TYPES.includes(facts.requestTypeSlug)) {
    return { ...base, allowed: false, refusal: "WRONG_TYPE" }
  }
  if (facts.unitStatuses.length === 0) {
    return { ...base, allowed: false, refusal: "NO_DEVICES" }
  }
  // A courier is already carrying these devices; closing over the counter as
  // well would deliver them twice and leave the partner's task orphaned.
  if (facts.openTaskCount > 0) {
    return { ...base, allowed: false, refusal: "OPEN_PARTNER_TASK" }
  }

  // Only assigned units move. Already-delivered ones are tolerated (a partial
  // handover recorded earlier), anything else means the devices are not in a
  // state that can be handed over at all.
  const deliverable = facts.unitStatuses.filter((s) => s === "assigned")
  const settled = facts.unitStatuses.filter((s) => s === "delivered")
  if (deliverable.length + settled.length !== facts.unitStatuses.length) {
    return { ...base, allowed: false, refusal: "DEVICES_NOT_READY" }
  }
  if (deliverable.length === 0) {
    return { ...base, allowed: false, refusal: "ALREADY_CLOSED" }
  }

  return { ...base, allowed: true, deliverCount: deliverable.length }
}
