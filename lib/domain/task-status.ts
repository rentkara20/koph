// Pure partner-task state machine, extracted from tasks.ts for unit testing.
// Three task kinds share the table but have distinct partner flows:
//   request:          pending → accepted → in_progress → pending_signoff → closed (admin sign-off)
//   supplier_pickup:  pending → accepted → arrived → picked_up → closed (warehouse receipt only —
//                     "picked_up" means in transit; the partner can never close a pickup).
//   ad_hoc:           streamlined trip — pending → in_progress → pending_signoff →
//                     closed. The partner "starts" straight from pending (accept +
//                     start merged into one tap); no request/PO/case anchor.

export type TaskKind = "request" | "supplier_pickup" | "ad_hoc"

export type PartnerAction =
  | "accept"
  | "reject"
  | "start"
  | "mark_done"
  | "mark_failed"
  | "mark_arrived"
  | "mark_picked_up"

export const ACTION_STATUS: Record<PartnerAction, string> = {
  accept: "accepted",
  reject: "rejected",
  start: "in_progress",
  mark_done: "pending_signoff",
  mark_failed: "failed",
  mark_arrived: "arrived",
  mark_picked_up: "picked_up",
}

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["in_progress"],
  in_progress: ["pending_signoff", "failed"],
}

// Pickup kind: no in_progress/pending_signoff; failure allowed until the goods
// are collected — after picked_up the units physically exist with the partner,
// so the only exits are warehouse receipt (closed) or admin intervention.
export const PICKUP_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["arrived", "failed"],
  arrived: ["picked_up", "failed"],
}

// Ad-hoc kind: accept+start merged, so the partner can go straight from pending
// to in_progress in one tap (no separate "accept" step). Reject still allowed
// from pending; fail allowed once in progress.
export const AD_HOC_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "rejected"],
  in_progress: ["pending_signoff", "failed"],
}

export function transitionsForKind(kind: TaskKind): Record<string, string[]> {
  if (kind === "supplier_pickup") return PICKUP_ALLOWED_TRANSITIONS
  if (kind === "ad_hoc") return AD_HOC_ALLOWED_TRANSITIONS
  return ALLOWED_TRANSITIONS
}

// True when `action` is a legal transition from the task's current status.
export function canTransition(
  fromStatus: string,
  action: PartnerAction,
  kind: TaskKind = "request"
): boolean {
  const target = ACTION_STATUS[action]
  return transitionsForKind(kind)[fromStatus]?.includes(target) ?? false
}
