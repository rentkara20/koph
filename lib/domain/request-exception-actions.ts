import { parseTimeWindow } from "./time-window"

export type RequestExceptionAction = "hold" | "resume" | "reschedule" | "cancel" | "retry" | "reopen"
export type RequestExceptionInput = { reason?: string; plannedDate?: number; timeWindow?: string }

function riyadhDateKey(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp))
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

export function requestExceptionActions(status: string): RequestExceptionAction[] {
  switch (status) {
    case "draft":
    case "assigned":
    case "in_progress":
      return ["hold", "reschedule", "cancel"]
    case "on_hold":
      return ["resume", "reschedule", "cancel"]
    case "rescheduled":
      return ["resume", "hold", "cancel"]
    case "failed":
      return ["retry", "cancel"]
    case "cancelled":
      return ["reopen"]
    default:
      return []
  }
}

export function validateRequestExceptionInput(
  status: "on_hold" | "cancelled" | "rescheduled" | "failed",
  input: RequestExceptionInput,
  now = Date.now()
): string | null {
  if ((status === "on_hold" || status === "cancelled") && !input.reason?.trim()) {
    return "Reason is required"
  }
  if (status === "rescheduled") {
    if (!input.plannedDate) return "A planned date is required"
    if (riyadhDateKey(input.plannedDate) < riyadhDateKey(now)) return "The planned date cannot be in the past"
    if (!input.timeWindow?.trim()) return "Time window is required"
    if (!parseTimeWindow(input.timeWindow)) return "Invalid time window"
  }
  return null
}
