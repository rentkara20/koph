export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
