// Fixed timeZone (Riyadh, matches the business-month default in
// lib/actions/settings.ts) is required, not cosmetic: without it, Node's
// server clock (UTC) and a viewer's browser clock can format the same
// timestamp as different calendar dates near midnight, which is a genuine
// server/client output mismatch for any Client Component that calls this
// during render (React hydration error #418, observed on /admin/users).
const DISPLAY_TIME_ZONE = "Asia/Riyadh"

// The business runs entirely in Riyadh, so a bare "YYYY-MM-DD" from an
// <input type="date"> means Riyadh midnight — never UTC midnight and never the
// server's local midnight. Parsing it any other way makes the stored instant
// depend on where the code runs: `new Date("2026-08-06T00:00:00")` is 00:00 UTC
// on Vercel but 00:00 AST on a developer's machine, so the same input produces
// two different timestamps and a date filter can land on the wrong calendar day.
// Pinning the offset here keeps writes and range queries agreeing everywhere.
//
// Safe against rows written under the older UTC-midnight convention: a Riyadh
// day spans [D 00:00+03, D+1 00:00+03) = [D-1 21:00Z, D 21:00Z), which still
// contains D 00:00Z, and formatDate renders both in Asia/Riyadh as day D.
export function parseRiyadhDate(value: string | null | undefined): number | null {
  if (!value) return null
  const ts = new Date(`${value}T00:00:00+03:00`).getTime()
  return Number.isNaN(ts) ? null : ts
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleDateString("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Locale-aware variant of formatDate, for list/table cells rendered inside an
// RTL container. formatDate always emits "17 Aug 2026" — a mixed-direction run
// (Latin month between two number runs) that the Unicode bidi algorithm
// reorders to "Aug 2026 17" once the paragraph direction is RTL. Rendering the
// month in Arabic makes the whole string one direction, so it reads correctly
// with no bidi isolation wrapper.
//
// `calendar: "gregory"` is required: the ar-SA default calendar is islamic, and
// the business runs on Gregorian dates. `numberingSystem: "latn"` keeps digits
// identical to every other number in the app (request numbers, quantities).
export function formatDateLocalized(ts: number | null | undefined, locale: string): string {
  if (!ts) return "—"
  if (locale !== "ar") return formatDate(ts)
  return new Date(ts).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Whole-day distance from today in the Riyadh calendar: negative = overdue,
// 0 = today, 1 = tomorrow. Both sides are normalised to the UTC midnight of
// their Riyadh calendar label, so the result is a pure calendar-day delta and
// never depends on the time of day the page was rendered.
export function riyadhDayDiff(ts: number | null | undefined, now: number = Date.now()): number | null {
  if (!ts) return null
  const dayStart = (ms: number) => Date.parse(`${toDateInputValue(ms)}T00:00:00Z`)
  return Math.round((dayStart(ts) - dayStart(now)) / 86_400_000)
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Format timestamp for audit page: "2026-06-18 10:42:15 AST (UTC+3)"
export function formatAuditDateTime(ts: number | null | undefined): string {
  if (!ts) return "—"
  const d = new Date(ts)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} AST (UTC+3)`
}

// A stored date as an <input type="date"> value — the exact inverse of
// parseRiyadhDate, and it must stay that way. Both sides resolve the calendar
// day in Asia/Riyadh, so a date entered as D is stored as D 00:00+03 and read
// back as D. Slicing toISOString() here instead would render Riyadh-midnight
// timestamps (D-1 21:00Z) as D-1 and walk every date back a day on each edit.
// en-CA is used purely because it formats as YYYY-MM-DD, which is what
// <input type="date"> requires.
export function toDateInputValue(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE }) : ""
}

// Today's calendar date in Riyadh, for prefilling an <input type="date">.
export function todayInputValue(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE })
}
