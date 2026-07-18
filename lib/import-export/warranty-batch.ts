import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { warrantyBatches, warrantyProducts } from "@/lib/db/schema"
import { createWarrantyBatchCore } from "@/lib/actions/warranty"
import type { ColumnDef, ImportRow } from "./types"

type Database = typeof db

// Matches warrantyBatches.source's DB enum exactly (lib/db/schema.ts). New
// CSV-created batches always land with purchaseOrderId/supplierId null —
// existing non-PO-sourced batches (source "separate"/"bulk" with no PO) are
// already a valid state in this schema, so that's fine for every source value.
const VALID_SOURCES = new Set(["with_device", "separate", "other_supplier", "bulk"])

// Internal fields intentionally NOT exposed via CSV: purchaseOrderId,
// supplierId (new batches from CSV get null for both — see project brief)
// and unitsAssigned (system-incremented only by assignWarrantyCore).
export const WARRANTY_BATCH_COLUMNS: ColumnDef[] = [
  { header: "warrantyProductName", field: "warrantyProductName", required: true },
  { header: "source", field: "source", required: true },
  { header: "invoiceRef", field: "invoiceRef", required: false },
  { header: "unitsCovered", field: "unitsCovered", required: true },
]

export async function exportWarrantyBatchRows(): Promise<Record<string, unknown>[]> {
  return db
    .select({
      warrantyProductName: warrantyProducts.nameEn,
      source: warrantyBatches.source,
      invoiceRef: warrantyBatches.invoiceRef,
      unitsCovered: warrantyBatches.unitsCovered,
    })
    .from(warrantyBatches)
    .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))
}

function parseUnitsCovered(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("unitsCovered is required")
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid unitsCovered: "${value}" (expected a whole number greater than 0)`)
  }
  return n
}

function batchKey(warrantyProductId: string, invoiceRef: string): string {
  return `${warrantyProductId}|${invoiceRef.trim().toLowerCase()}`
}

// Create-only module: warranty batches have no update path via CSV.
// unitsAssigned is system-incremented elsewhere (assignWarrantyCore) and is
// never touched here. A CSV row whose warrantyProductName+invoiceRef matches
// an existing batch is classified as an error, not silently skipped.
export async function validateWarrantyBatchRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const products = await database
    .select({ id: warrantyProducts.id, nameEn: warrantyProducts.nameEn })
    .from(warrantyProducts)
  const productByName = new Map(products.map((p) => [p.nameEn.trim().toLowerCase(), p.id]))

  const existingBatches = await database
    .select({ warrantyProductId: warrantyBatches.warrantyProductId, invoiceRef: warrantyBatches.invoiceRef })
    .from(warrantyBatches)
  const existingKeys = new Set(
    existingBatches
      .filter((b) => b.invoiceRef)
      .map((b) => batchKey(b.warrantyProductId, b.invoiceRef as string))
  )

  const results: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2
    try {
      const warrantyProductName = raw.warrantyProductName?.trim()
      if (!warrantyProductName) throw new Error("warrantyProductName is required")
      const warrantyProductId = productByName.get(warrantyProductName.toLowerCase())
      if (!warrantyProductId) throw new Error(`No warranty product found named "${warrantyProductName}"`)

      const source = raw.source?.trim()
      if (!source) throw new Error("source is required")
      if (!VALID_SOURCES.has(source)) {
        throw new Error(
          `Invalid source: "${source}" (expected one of ${Array.from(VALID_SOURCES).join(", ")})`
        )
      }

      const invoiceRef = raw.invoiceRef?.trim() || undefined
      const unitsCovered = parseUnitsCovered(raw.unitsCovered ?? "")

      if (invoiceRef && existingKeys.has(batchKey(warrantyProductId, invoiceRef))) {
        throw new Error("Existing warranty batches cannot be edited via CSV import")
      }

      results.push({
        rowNumber,
        raw,
        classification: "new",
        input: {
          warrantyProductId,
          source,
          invoiceRef,
          unitsCovered,
        },
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

export async function commitWarrantyBatchRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  if (row.classification === "new") {
    await createWarrantyBatchCore(
      tx,
      row.input as {
        warrantyProductId: string
        source: "with_device" | "separate" | "other_supplier" | "bulk"
        invoiceRef?: string
        unitsCovered: number
      },
      actorUserId
    )
  }
  // "update" is never produced by validateWarrantyBatchRows — this module is create-only.
}
