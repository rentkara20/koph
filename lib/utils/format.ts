// Fixed timeZone (Riyadh, matches the business-month default in
// lib/actions/settings.ts) is required, not cosmetic: without it, Node's
// server clock (UTC) and a viewer's browser clock can format the same
// timestamp as different calendar dates near midnight, which is a genuine
// server/client output mismatch for any Client Component that calls this
// during render (React hydration error #418, observed on /admin/users).
const DISPLAY_TIME_ZONE = "Asia/Riyadh"

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleDateString("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  })
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
