/**
 * Signature stages — WHO is signing a given signature_request, and what that
 * stage is allowed to do.
 *
 * A note can carry two signatures. Stage 1 ("receiver") is always the person
 * physically present at the handover. Stage 2 countersigns the SAME document
 * and comes in two flavours:
 *
 *   authorized — the customer's flagged authorised signatory ratifies what
 *     their receiver accepted. Still the customer's side of the table.
 *   kara_agent — Kara's own rep countersigns a collection. On a collection the
 *     customer releases the devices (stage 1) and Kara takes them (stage 2), so
 *     without this stage the rep either signs nothing or — the failure this
 *     exists to prevent — signs in the customer's box and the receipt claims
 *     the customer released devices to themselves.
 */

export type SignatoryRole = "receiver" | "authorized" | "kara_agent"

/** Stage-2 roles: every role that countersigns an already-signed stage-1 note. */
const COUNTERSIGN_ROLES = new Set<SignatoryRole>(["authorized", "kara_agent"])

export function isCountersignStage(role: string): boolean {
  return COUNTERSIGN_ROLES.has(role as SignatoryRole)
}

/**
 * Only stage 1 inspects the goods. A countersigner is attesting to the record,
 * not to a physical count, so they get no per-item condition selector and their
 * submission carries no delivery outcome.
 */
export function stageInspectsItems(role: string): boolean {
  return !isCountersignStage(role)
}

/**
 * Only stage 1 marks the partner task as having received its signature, and
 * only stage 1 can record a delivery outcome that gates sign-off. A
 * countersignature must never re-open or re-advance the task.
 */
export function stageAdvancesDeliveryTask(role: string): boolean {
  return !isCountersignStage(role)
}

/**
 * Kara's rep countersigns on the same device seconds after the customer, and
 * signs as an employee — there is no customer identity to verify, so a national
 * ID requirement inherited from stage 1 would just block the rep.
 */
export function stageRequiresCustomerIdentity(role: string): boolean {
  return role !== "kara_agent"
}
