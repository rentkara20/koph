import Papa from "papaparse"
import type { ColumnDef } from "./types"

// Parses an uploaded CSV's text into header-keyed row objects. Header names
// are matched exactly against each module's configured column headers (case
// sensitive, like the template we hand out) — trims whitespace only.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  })
  const headers = result.meta.fields ?? []
  return { headers, rows: result.data }
}

// Builds a template/export CSV from column defs + optional data rows.
export function toCsv(columns: ColumnDef[], rows: Record<string, unknown>[]): string {
  const headers = columns.map((c) => c.header)
  const data = rows.map((row) => columns.map((c) => formatCell(row[c.field])))
  return Papa.unparse({ fields: headers, data })
}

function formatCell(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "number") return String(value)
  return String(value)
}
