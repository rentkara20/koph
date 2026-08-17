// The business runs entirely in Riyadh, so a bare "YYYY-MM-DD" always means a
// Riyadh calendar day. parseRiyadhDate and toDateInputValue are inverses of
// each other and must stay that way: if one is changed to resolve the day in
// UTC or in server-local time, every stored date walks by a day on each
// edit/export round-trip. These tests fail if the pair drifts apart.
import { describe, expect, test } from "vitest"
import {
  formatDate,
  formatDateLocalized,
  parseRiyadhDate,
  riyadhDayDiff,
  toDateInputValue,
  todayInputValue,
} from "./format"

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

// ─── List-view date helpers ──────────────────────────────────────────────────
// The requests list colours a row by how far its date is from today and renders
// the date inside an RTL container. Both behaviours are pure functions of the
// Riyadh calendar day, and both break in ways that are invisible in review:
// an off-by-one diff mislabels "today" as "overdue", and a Latin month name
// inside an Arabic paragraph gets silently reordered by the bidi algorithm.
describe("riyadhDayDiff", () => {
  const noon = parseRiyadhDate("2026-08-16")! + 12 * 3_600_000

  test("returns 0 for any instant on the same Riyadh day", () => {
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-16")!, noon)).toBe(0)
    // 23:59 Riyadh is still the same calendar day, though it is the next day UTC
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-16")! + 86_399_000, noon)).toBe(0)
  })

  test("is negative for past days and positive for future days", () => {
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-15")!, noon)).toBe(-1)
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-10")!, noon)).toBe(-6)
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-17")!, noon)).toBe(1)
  })

  test("counts calendar days, not 24h blocks, from any time of day", () => {
    // Just before Riyadh midnight, "tomorrow" is still exactly 1 day away even
    // though it is only minutes later in absolute time.
    const lateNight = parseRiyadhDate("2026-08-16")! + 86_340_000
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-17")!, lateNight)).toBe(1)
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-16")!, lateNight)).toBe(0)
  })

  test("crosses month and year boundaries", () => {
    const jan1 = parseRiyadhDate("2027-01-01")!
    expect(riyadhDayDiff(parseRiyadhDate("2026-12-31")!, jan1)).toBe(-1)
    expect(riyadhDayDiff(parseRiyadhDate("2026-08-31")!, parseRiyadhDate("2026-09-01")!)).toBe(-1)
  })

  test("returns null for a missing date", () => {
    expect(riyadhDayDiff(null)).toBeNull()
    expect(riyadhDayDiff(undefined)).toBeNull()
    expect(riyadhDayDiff(0)).toBeNull()
  })
})

describe("formatDateLocalized", () => {
  const ts = parseRiyadhDate("2026-08-17")!

  test("matches formatDate for non-Arabic locales", () => {
    expect(formatDateLocalized(ts, "en")).toBe(formatDate(ts))
  })

  test("renders an all-Arabic month so the string has one bidi direction", () => {
    const out = formatDateLocalized(ts, "ar")
    // No Latin letters: a Latin month between two digit runs is what the bidi
    // algorithm reorders into "Aug 2026 17" inside an RTL paragraph.
    expect(out).not.toMatch(/[A-Za-z]/)
    expect(out).toMatch(/[؀-ۿ]/)
  })

  test("uses the Gregorian calendar and Latin digits, not the ar-SA defaults", () => {
    const out = formatDateLocalized(ts, "ar")
    expect(out).toContain("17")
    expect(out).toContain("2026")
    // ar-SA defaults to the Islamic calendar (year 1448 here) and would also
    // pick Arabic-Indic digits without the explicit numbering system.
    expect(out).not.toContain("1448")
    expect(out).not.toMatch(/[٠-٩]/)
  })

  test("renders the Riyadh calendar day, not the UTC one", () => {
    // Riyadh midnight is 21:00Z the previous day; formatting in UTC would
    // show the 16th.
    expect(formatDateLocalized(ts, "ar")).toContain("17")
    expect(formatDate(ts)).toContain("17")
  })

  test("returns an em dash for a missing date in both locales", () => {
    expect(formatDateLocalized(null, "ar")).toBe("—")
    expect(formatDateLocalized(undefined, "en")).toBe("—")
  })
})
