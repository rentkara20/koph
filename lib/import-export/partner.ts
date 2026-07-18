import { isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { partners } from "@/lib/db/schema"
import { createPartnerCore, updatePartnerCore, type PartnerCoreInput } from "@/lib/actions/partners"
import type { ColumnDef, ImportRow } from "./types"

type Database = typeof db

// Matches partners.status's DB enum exactly (lib/db/schema.ts).
const VALID_STATUSES = new Set(["active", "inactive"])

// Internal/system fields skipped: userId (portal login FK) and
// activationToken/activationTokenExpiresAt (system-managed, unique) — not
// CSV-editable, per project brief.
export const PARTNER_COLUMNS: ColumnDef[] = [
  { header: "name", field: "name", required: true },
  { header: "contactPerson", field: "contactPerson", required: false },
  { header: "mobile", field: "mobile", required: false },
  { header: "email", field: "email", required: false },
  { header: "city", field: "city", required: false },
  { header: "notes", field: "notes", required: false },
  { header: "status", field: "status", required: false },
]

export async function exportPartnerRows(): Promise<Record<string, unknown>[]> {
  return db
    .select({
      name: partners.name,
      contactPerson: partners.contactPerson,
      mobile: partners.mobile,
      email: partners.email,
      city: partners.city,
      notes: partners.notes,
      status: partners.status,
    })
    .from(partners)
    .where(isNull(partners.deletedAt))
}

// Natural key: name, exact match case-insensitive/trim — there is no unique
// constraint on partner.name, so this is a best-effort match, not a lookup key.
function naturalKey(name: string): string {
  return name.trim().toLowerCase()
}

export async function validatePartnerRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const existing = await database
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(isNull(partners.deletedAt))
  const byNaturalKey = new Map(existing.map((p) => [naturalKey(p.name), p.id]))

  const results: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2
    try {
      const name = raw.name?.trim()
      if (!name) throw new Error("Name is required")

      const statusRaw = raw.status?.trim()
      if (statusRaw && !VALID_STATUSES.has(statusRaw)) {
        throw new Error(`Invalid status: "${statusRaw}" (expected active or inactive)`)
      }

      const input: PartnerCoreInput = {
        name,
        contactPerson: raw.contactPerson?.trim() || undefined,
        mobile: raw.mobile?.trim() || undefined,
        email: raw.email?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        notes: raw.notes?.trim() || undefined,
        status: (statusRaw as "active" | "inactive") || "active",
      }

      const matchedId = byNaturalKey.get(naturalKey(name))

      results.push({
        rowNumber,
        raw,
        classification: matchedId ? "update" : "new",
        matchedId,
        input: input as unknown as Record<string, unknown>,
      })
    } catch (error) {
      results.push({
        rowNumber,
        raw,
        classification: "error",
        error: error instanceof Error ? error.message : "Invalid row",
      })
    }
  }
  return results
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function commitPartnerRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  const input = row.input as unknown as PartnerCoreInput
  if (row.classification === "new") {
    await createPartnerCore(tx, input, actorUserId)
  } else if (row.classification === "update" && row.matchedId) {
    await updatePartnerCore(tx, row.matchedId, input)
  }
}
