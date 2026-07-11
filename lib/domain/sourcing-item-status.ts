// Sourcing request item status (Sourcing V2). Item statuses are DERIVED from
// what happened to the item, never set freely by users: pending → rfq_sent
// (included in an RFQ) → quoted (a quotation line references it) → selected
// (awarded under an approved evaluation). not_sourced / cancelled are terminal
// operator decisions.

export type SourcingItemStatus =
  | "pending"
  | "rfq_sent"
  | "quoted"
  | "selected"
  | "not_sourced"
  | "cancelled"

const TERMINAL_STATUSES: SourcingItemStatus[] = ["not_sourced", "cancelled"]

// An item can be put on an RFQ at any non-terminal point — re-quoting an
// already quoted/selected item is a legitimate revision flow.
export function canIncludeItemInRfq(status: SourcingItemStatus): boolean {
  return !TERMINAL_STATUSES.includes(status)
}

// Sending an RFQ only ever advances a pending item; it never regresses an
// item that is already further along (quoted/selected).
export function itemStatusAfterRfq(status: SourcingItemStatus): SourcingItemStatus {
  return status === "pending" ? "rfq_sent" : status
}
