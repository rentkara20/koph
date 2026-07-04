import { describe, it, expect } from "vitest"
import { deriveRequestStatus } from "./request-status"

describe("deriveRequestStatus", () => {
  it("returns null for manual statuses (never auto-overridden)", () => {
    expect(deriveRequestStatus("on_hold", ["pending"])).toBeNull()
    expect(deriveRequestStatus("cancelled", ["closed"])).toBeNull()
    expect(deriveRequestStatus("rescheduled", ["in_progress"])).toBeNull()
    expect(deriveRequestStatus("failed", ["closed"])).toBeNull()
  })

  it("returns null when there are no tasks", () => {
    expect(deriveRequestStatus("draft", [])).toBeNull()
  })

  it("draft with any tasks becomes assigned", () => {
    expect(deriveRequestStatus("draft", ["pending"])).toBe("assigned")
    expect(deriveRequestStatus("draft", ["in_progress"])).toBe("assigned")
  })

  it("in-progress task moves assigned → in_progress", () => {
    expect(deriveRequestStatus("assigned", ["in_progress"])).toBe("in_progress")
    expect(deriveRequestStatus("assigned", ["pending_signoff"])).toBe("in_progress")
  })

  it("does not re-set in_progress when already in_progress", () => {
    expect(deriveRequestStatus("in_progress", ["in_progress"])).toBeNull()
  })

  it("all tasks closed → completed", () => {
    expect(deriveRequestStatus("in_progress", ["closed", "closed"])).toBe("completed")
  })

  it("all tasks rejected/failed with none closed → failed (no more dead-end)", () => {
    expect(deriveRequestStatus("assigned", ["rejected"])).toBe("failed")
    expect(deriveRequestStatus("assigned", ["failed", "rejected"])).toBe("failed")
    expect(deriveRequestStatus("in_progress", ["cancelled", "failed"])).toBe("failed")
  })

  it("mixed active + closed stays in progress path, not completed", () => {
    // one still active, one closed → not all-closed, so completed does not fire
    expect(deriveRequestStatus("in_progress", ["pending", "closed"])).toBeNull()
  })

  it("returns null when already completed and all closed", () => {
    expect(deriveRequestStatus("completed", ["closed"])).toBeNull()
  })
})
