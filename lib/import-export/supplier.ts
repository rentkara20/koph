import { isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { suppliers } from "@/lib/db/schema"
import { createSupplierCore, updateSupplierCore, type SupplierCoreInput } from "@/lib/actions/suppliers"
import type { ColumnDef, ImportRow } from "./types"

type Database = typeof db

// Internal/system fields skipped: pickupMapsUrl (URL field, out of scope per
// project brief) and createdBy (system-set actor id, not CSV-editable).
export const SUPPLIER_COLUMNS: ColumnDef[] = [
  { header: "name", field: "name", required: true },
  { header: "contactPerson", field: "contactPerson", required: false },
  { header: "mobile", field: "mobile", required: false },
  { header: "email", field: "email", required: false },
  { header: "city", field: "city", required: false },
  { header: "address", field: "address", required: false },
  { header: "notes", field: "notes", required: false },
  { header: "pickupContactName", field: "pickupContactName", required: false },
  { header: "pickupContactMobile", field: "pickupContactMobile", required: false },
  { header: "pickupNotes", field: "pickupNotes", required: false },
]

export async function exportSupplierRows(): Promise<Record<string, unknown>[]> {
  return db
    .select({
      name: suppliers.name,
      contactPerson: suppliers.contactPerson,
      mobile: suppliers.mobile,
      email: suppliers.email,
      city: suppliers.city,
      address: suppliers.address,
      notes: suppliers.notes,
      pickupContactName: suppliers.pickupContactName,
      pickupContactMobile: suppliers.pickupContactMobile,
      pickupNotes: suppliers.pickupNotes,
    })
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
}

// Natural key: name, exact match case-insensitive/trim — there is no unique
// constraint on supplier.name, so this is a best-effort match, not a lookup key.
function naturalKey(name: string): string {
  return name.trim().toLowerCase()
}

export async function validateSupplierRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const existing = await database
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
  const byNaturalKey = new Map(existing.map((s) => [naturalKey(s.name), s.id]))

  const results: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2
    try {
      const name = raw.name?.trim()
      if (!name) throw new Error("Name is required")

      const input: SupplierCoreInput = {
        name,
        contactPerson: raw.contactPerson?.trim() || undefined,
        mobile: raw.mobile?.trim() || undefined,
        email: raw.email?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        address: raw.address?.trim() || undefined,
        notes: raw.notes?.trim() || undefined,
        pickupContactName: raw.pickupContactName?.trim() || undefined,
        pickupContactMobile: raw.pickupContactMobile?.trim() || undefined,
        pickupNotes: raw.pickupNotes?.trim() || undefined,
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

export async function commitSupplierRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  const input = row.input as unknown as SupplierCoreInput
  if (row.classification === "new") {
    await createSupplierCore(tx, input, actorUserId)
  } else if (row.classification === "update" && row.matchedId) {
    await updateSupplierCore(tx, row.matchedId, input)
  }
}
