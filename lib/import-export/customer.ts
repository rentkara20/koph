import { isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers } from "@/lib/db/schema"
import { createCustomerCore, updateCustomerCore, type CustomerCoreInput } from "@/lib/actions/customers"
import type { ColumnDef, ImportRow } from "./types"

type Database = typeof db

export const CUSTOMER_COLUMNS: ColumnDef[] = [
  { header: "id", field: "id", required: false },
  { header: "name", field: "name", required: true },
  { header: "contactPerson", field: "contactPerson", required: false },
  { header: "mobile", field: "mobile", required: false },
  { header: "email", field: "email", required: false },
  { header: "city", field: "city", required: false },
  { header: "address", field: "address", required: false },
  { header: "mapsLink", field: "mapsLink", required: false },
  { header: "notes", field: "notes", required: false },
]

export async function exportCustomerRows(): Promise<Record<string, unknown>[]> {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      contactPerson: customers.contactPerson,
      mobile: customers.mobile,
      email: customers.email,
      city: customers.city,
      address: customers.address,
      mapsLink: customers.mapsLink,
      notes: customers.notes,
    })
    .from(customers)
    .where(isNull(customers.deletedAt))
}

// Natural key when no `id` column/match is given: name + mobile (case
// insensitive on name). Documented in the module brief as "e.g. name+mobile".
function naturalKey(name: string, mobile: string): string {
  return `${name.trim().toLowerCase()}|${mobile.trim().toLowerCase()}`
}

export async function validateCustomerRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const existing = await database
    .select({ id: customers.id, name: customers.name, mobile: customers.mobile })
    .from(customers)
    .where(isNull(customers.deletedAt))
  const byId = new Map(existing.map((c) => [c.id, c]))
  const byNaturalKey = new Map(existing.map((c) => [naturalKey(c.name, c.mobile ?? ""), c]))

  const results: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2
    try {
      const name = raw.name?.trim()
      if (!name) throw new Error("Name is required")

      const input: CustomerCoreInput = {
        name,
        contactPerson: raw.contactPerson?.trim() || undefined,
        mobile: raw.mobile?.trim() || undefined,
        email: raw.email?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        address: raw.address?.trim() || undefined,
        mapsLink: raw.mapsLink?.trim() || undefined,
        notes: raw.notes?.trim() || undefined,
      }

      const explicitId = raw.id?.trim()
      let matchedId: string | undefined
      if (explicitId) {
        if (!byId.has(explicitId)) throw new Error(`No existing customer with id "${explicitId}"`)
        matchedId = explicitId
      } else {
        matchedId = byNaturalKey.get(naturalKey(name, input.mobile ?? ""))?.id
      }

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

export async function commitCustomerRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  const input = row.input as unknown as CustomerCoreInput
  if (row.classification === "new") {
    await createCustomerCore(tx, input, actorUserId)
  } else if (row.classification === "update" && row.matchedId) {
    await updateCustomerCore(tx, row.matchedId, input)
  }
}
