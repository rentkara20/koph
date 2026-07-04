// Pure partner-task state machine, extracted from tasks.ts for unit testing.

export type PartnerAction = "accept" | "reject" | "start" | "mark_done" | "mark_failed"

export const ACTION_STATUS: Record<PartnerAction, string> = {
  accept: "accepted",
  reject: "rejected",
  start: "in_progress",
  mark_done: "pending_signoff",
  mark_failed: "failed",
}

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["in_progress"],
  in_progress: ["pending_signoff", "failed"],
}

// True when `action` is a legal transition from the task's current status.
export function canTransition(fromStatus: string, action: PartnerAction): boolean {
  const target = ACTION_STATUS[action]
  return ALLOWED_TRANSITIONS[fromStatus]?.includes(target) ?? false
}
