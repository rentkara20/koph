// Pure request-status derivation from the set of its partner tasks, extracted
// from syncRequestStatus so the branch table can be unit-tested.

export const ACTIVE_TASK_STATUSES = ["pending", "accepted", "in_progress", "pending_signoff"]
export const MANUAL_REQUEST_STATUSES = ["on_hold", "cancelled", "rescheduled", "failed"]

// Returns the next request status, or null if no change is warranted. Never
// overrides a manual ops status. Mirrors syncRequestStatus in lib/actions/tasks.ts.
export function deriveRequestStatus(
  currentStatus: string,
  taskStatuses: string[]
): string | null {
  if (MANUAL_REQUEST_STATUSES.includes(currentStatus)) return null
  if (taskStatuses.length === 0) return null

  const active = taskStatuses.filter((s) => ACTIVE_TASK_STATUSES.includes(s))
  const closed = taskStatuses.filter((s) => s === "closed")
  const inProgress = taskStatuses.filter((s) => ["in_progress", "pending_signoff"].includes(s))

  if (currentStatus === "draft") return "assigned"
  if (inProgress.length > 0 && currentStatus !== "in_progress") return "in_progress"
  if (active.length === 0 && closed.length > 0 && currentStatus !== "completed") return "completed"
  if (active.length === 0 && closed.length === 0 && currentStatus !== "failed") return "failed"
  return null
}
