import { describe, expect, it } from "vitest"
import { requestExceptionActions, validateRequestExceptionInput } from "./request-exception-actions"

describe("requestExceptionActions", () => {
  it("offers only exceptional actions during the normal workflow", () => {
    expect(requestExceptionActions("draft")).toEqual(["hold", "reschedule", "cancel"])
    expect(requestExceptionActions("assigned")).toEqual(["hold", "reschedule", "cancel"])
    expect(requestExceptionActions("in_progress")).toEqual(["hold", "reschedule", "cancel"])
  })

  it("offers context-aware recovery for paused and failed requests", () => {
    expect(requestExceptionActions("on_hold")).toEqual(["resume", "reschedule", "cancel"])
    expect(requestExceptionActions("rescheduled")).toEqual(["resume", "hold", "cancel"])
    expect(requestExceptionActions("failed")).toEqual(["retry", "cancel"])
    expect(requestExceptionActions("cancelled")).toEqual(["reopen"])
  })

  it("keeps completed requests final", () => {
    expect(requestExceptionActions("completed")).toEqual([])
  })
})

describe("validateRequestExceptionInput", () => {
  it("requires a reason for pausing or cancelling", () => {
    expect(validateRequestExceptionInput("on_hold", { reason: " " })).toBe("Reason is required")
    expect(validateRequestExceptionInput("cancelled", {})).toBe("Reason is required")
    expect(validateRequestExceptionInput("on_hold", { reason: "Waiting for customer" })).toBeNull()
  })

  it("requires a day and a broad time window when rescheduling", () => {
    const now = Date.UTC(2026, 6, 16, 22, 30) // 17 Jul, 01:30 in Riyadh
    const yesterday = Date.UTC(2026, 6, 16)
    const today = Date.UTC(2026, 6, 17)
    expect(validateRequestExceptionInput("rescheduled", {}, now)).toBe("A planned date is required")
    expect(validateRequestExceptionInput("rescheduled", { plannedDate: yesterday, timeWindow: "09:00-12:00" }, now)).toBe("The planned date cannot be in the past")
    expect(validateRequestExceptionInput("rescheduled", { plannedDate: today }, now)).toBe("Time window is required")
    expect(validateRequestExceptionInput("rescheduled", { plannedDate: today, timeWindow: "14:00-10:00" }, now)).toBe("Invalid time window")
    expect(validateRequestExceptionInput("rescheduled", { plannedDate: today, timeWindow: "09:00-12:00" }, now)).toBeNull()
  })
})
