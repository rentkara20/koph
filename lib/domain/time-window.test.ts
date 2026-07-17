import { describe, expect, it } from "vitest"
import { buildTimeWindow, parseTimeWindow } from "./time-window"

describe("time windows", () => {
  it("builds a flexible whole-hour window", () => {
    expect(buildTimeWindow("10:00", "14:00")).toBe("10:00-14:00")
  })

  it("rejects an end time that is not after the start", () => {
    expect(buildTimeWindow("14:00", "10:00")).toBeNull()
    expect(buildTimeWindow("10:00", "10:00")).toBeNull()
  })

  it("parses stored windows for editing", () => {
    expect(parseTimeWindow("09:00-12:00")).toEqual({ start: "09:00", end: "12:00" })
    expect(parseTimeWindow("Morning")).toBeNull()
  })
})
