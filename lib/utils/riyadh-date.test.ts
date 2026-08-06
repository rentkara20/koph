// The business runs entirely in Riyadh, so a bare "YYYY-MM-DD" always means a
// Riyadh calendar day. parseRiyadhDate and toDateInputValue are inverses of
// each other and must stay that way: if one is changed to resolve the day in
// UTC or in server-local time, every stored date walks by a day on each
// edit/export round-trip. These tests fail if the pair drifts apart.
import { describe, expect, test } from "vitest"
import { formatDate, parseRiyadhDate, toDateInputValue, todayInputValue } from "./format"

const DATES = ["2026-08-06", "2026-01-01", "2026-12-31", "2026-02-28", "2024-02-29"]

describe("parseRiyadhDate", () => {
  test("resolves the date as Riyadh midnight, i.e. 21:00Z the day before", () => {
    expect(parseRiyadhDate("2026-08-06")).toBe(Date.parse("2026-08-05T21:00:00.000Z"))
  })

  test("returns null for empty and malformed input", () => {
    for (const bad of ["", null, undefined, "not-a-date", "2026-13-45"]) {
      expect(parseRiyadhDate(bad as string | null | undefined)).toBeNull()
    }
  })

  test("does not depend on the machine's timezone", () => {
    // Same absolute instant regardless of where this runs — the +03:00 offset
    // is pinned in the parser, not inherited from the host clock.
    expect(parseRiyadhDate("2026-08-06")).toBe(1785963600000)
  })
})

describe("parse/format round-trip", () => {
  test.each(DATES)("%s survives parse -> format unchanged", (d) => {
    expect(toDateInputValue(parseRiyadhDate(d))).toBe(d)
  })

  test.each(DATES)("%s survives ten consecutive edit round-trips", (d) => {
    let value = d
    for (let i = 0; i < 10; i++) value = toDateInputValue(parseRiyadhDate(value))
    expect(value).toBe(d)
  })

  test("formatDate renders the same calendar day the user typed", () => {
    expect(formatDate(parseRiyadhDate("2026-08-06"))).toBe("6 Aug 2026")
  })
})

describe("backward compatibility with legacy UTC-midnight rows", () => {
  // Rows written before the Riyadh convention stored UTC midnight. They must
  // still display and filter as the day they were entered on.
  const legacy = (d: string) => Date.parse(`${d}T00:00:00.000Z`)

  test.each(DATES)("legacy %s still reads back as the same day", (d) => {
    expect(toDateInputValue(legacy(d))).toBe(d)
    expect(formatDate(legacy(d))).toBe(formatDate(parseRiyadhDate(d)))
  })

  test("a Riyadh day window captures legacy and new rows, and excludes neighbours", () => {
    const start = parseRiyadhDate("2026-08-06")!
    const end = parseRiyadhDate("2026-08-07")!
    const inWindow = (ts: number) => ts >= start && ts < end

    expect(inWindow(legacy("2026-08-06"))).toBe(true)
    expect(inWindow(parseRiyadhDate("2026-08-06")!)).toBe(true)
    expect(inWindow(legacy("2026-08-05"))).toBe(false)
    expect(inWindow(legacy("2026-08-07"))).toBe(false)
    expect(inWindow(parseRiyadhDate("2026-08-07")!)).toBe(false)
  })
})

describe("todayInputValue", () => {
  test("is a well-formed date that round-trips", () => {
    const today = todayInputValue()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(toDateInputValue(parseRiyadhDate(today))).toBe(today)
  })
})
