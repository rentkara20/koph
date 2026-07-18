import { db } from "@/lib/db"
import { warrantyProducts } from "@/lib/db/schema"
import { createWarrantyProductCore } from "@/lib/actions/warranty"
import type { ColumnDef, ImportRow } from "./types"

type Database = typeof db

export const WARRANTY_PRODUCT_COLUMNS: ColumnDef[] = [
  { header: "nameAr", field: "nameAr", required: true },
  { header: "nameEn", field: "nameEn", required: true },
  { header: "durationMonths", field: "durationMonths", required: true },
  { header: "providerName", field: "providerName", required: false },
]

export async function exportWarrantyProductRows(): Promise<Record<string, unknown>[]> {
  return db
    .select({
      nameAr: warrantyProducts.nameAr,
      nameEn: warrantyProducts.nameEn,
      durationMonths: warrantyProducts.durationMonths,
      providerName: warrantyProducts.providerName,
    })
    .from(warrantyProducts)
}

// Natural key: nameEn, exact match case-insensitive/trim.
function naturalKey(nameEn: string): string {
  return nameEn.trim().toLowerCase()
}

function parseDurationMonths(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("durationMonths is required")
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid durationMonths: "${value}" (expected a whole number greater than 0)`)
  }
  return n
}

// Create-only module: there is no updateWarrantyProduct action in this
// codebase (lib/actions/warranty.ts), so a CSV row matching an existing
// product by nameEn is classified as an error rather than silently skipped
// or applied as an update.
export async function validateWarrantyProductRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const existing = await database
    .select({ id: warrantyProducts.id, nameEn: warrantyProducts.nameEn })
    .from(warrantyProducts)
  const byNaturalKey = new Set(existing.map((p) => naturalKey(p.nameEn)))

  const seenInFile = new Set<string>()
  const results: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2
    try {
      const nameAr = raw.nameAr?.trim()
      const nameEn = raw.nameEn?.trim()
      if (!nameAr) throw new Error("nameAr is required")
      if (!nameEn) throw new Error("nameEn is required")

      const key = naturalKey(nameEn)
      if (byNaturalKey.has(key)) {
        throw new Error(
          "Updating existing warranty products via CSV is not supported — edit from the Warranty page"
        )
      }
      if (seenInFile.has(key)) throw new Error(`Duplicate nameEn in file: ${nameEn}`)
      seenInFile.add(key)

      const durationMonths = parseDurationMonths(raw.durationMonths ?? "")
      const providerName = raw.providerName?.trim() || undefined

      results.push({
        rowNumber,
        raw,
        classification: "new",
        input: { nameAr, nameEn, durationMonths, providerName },
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

export async function commitWarrantyProductRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  if (row.classification === "new") {
    await createWarrantyProductCore(
      tx,
      row.input as { nameAr: string; nameEn: string; durationMonths: number; providerName?: string },
      actorUserId
    )
  }
  // "update" is never produced by validateWarrantyProductRows — this module is create-only.
}
