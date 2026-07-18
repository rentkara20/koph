import { db } from "@/lib/db"
import { csvImportBatch, csvImportRowError } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { ASSET_COLUMNS, commitAssetRow, exportAssetRows, validateAssetRows } from "./asset"
import { CUSTOMER_COLUMNS, commitCustomerRow, exportCustomerRows, validateCustomerRows } from "./customer"
import { ORDER_COLUMNS, commitOrderRow, exportOrderRows, validateOrderRows } from "./order"
import { SUPPLIER_COLUMNS, commitSupplierRow, exportSupplierRows, validateSupplierRows } from "./supplier"
import { PARTNER_COLUMNS, commitPartnerRow, exportPartnerRows, validatePartnerRows } from "./partner"
import {
  WARRANTY_PRODUCT_COLUMNS,
  commitWarrantyProductRow,
  exportWarrantyProductRows,
  validateWarrantyProductRows,
} from "./warranty-product"
import {
  WARRANTY_BATCH_COLUMNS,
  commitWarrantyBatchRow,
  exportWarrantyBatchRows,
  validateWarrantyBatchRows,
} from "./warranty-batch"
import { REQUEST_COLUMNS, exportRequestRows } from "./request"
import { WARRANTY_ASSIGNMENT_COLUMNS, exportWarrantyAssignmentRows } from "./warranty-assignment"
import { PRODUCT_FOR_SALE_COLUMNS, exportProductForSaleRows } from "./product-for-sale"
import { toCsv } from "./csv"
import {
  PREVIEW_SAMPLE_CAP,
  type ColumnDef,
  type CommitSummary,
  type ImportRow,
  type ModuleKey,
  type PreviewSummary,
} from "./types"
import { eq } from "drizzle-orm"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type ModuleConfig = {
  key: ModuleKey
  label: string
  columns: ColumnDef[]
  naturalKey: string
  exportRows: () => Promise<Record<string, unknown>[]>
  exportOnly?: boolean
  validateRows?: (database: typeof db, rows: Record<string, string>[]) => Promise<ImportRow[]>
  commitRow?: (tx: Tx, row: ImportRow, actorUserId: string | null) => Promise<void>
}

export const IMPORT_EXPORT_MODULES: Record<ModuleKey, ModuleConfig> = {
  asset: {
    key: "asset",
    label: "Assets",
    columns: ASSET_COLUMNS,
    naturalKey: "assetTag",
    exportRows: exportAssetRows,
    validateRows: validateAssetRows,
    commitRow: commitAssetRow,
  },
  customer: {
    key: "customer",
    label: "Customers",
    columns: CUSTOMER_COLUMNS,
    naturalKey: "id, else name+mobile",
    exportRows: exportCustomerRows,
    validateRows: validateCustomerRows,
    commitRow: commitCustomerRow,
  },
  order: {
    key: "order",
    label: "Orders",
    columns: ORDER_COLUMNS,
    naturalKey: "orderNumber",
    exportRows: exportOrderRows,
    validateRows: validateOrderRows,
    commitRow: commitOrderRow,
  },
  supplier: {
    key: "supplier",
    label: "Suppliers",
    columns: SUPPLIER_COLUMNS,
    naturalKey: "name (case-insensitive)",
    exportRows: exportSupplierRows,
    validateRows: validateSupplierRows,
    commitRow: commitSupplierRow,
  },
  partner: {
    key: "partner",
    label: "Partners",
    columns: PARTNER_COLUMNS,
    naturalKey: "name (case-insensitive)",
    exportRows: exportPartnerRows,
    validateRows: validatePartnerRows,
    commitRow: commitPartnerRow,
  },
  warrantyProduct: {
    key: "warrantyProduct",
    label: "Warranty products",
    columns: WARRANTY_PRODUCT_COLUMNS,
    naturalKey: "nameEn (case-insensitive, create-only)",
    exportRows: exportWarrantyProductRows,
    validateRows: validateWarrantyProductRows,
    commitRow: commitWarrantyProductRow,
  },
  warrantyBatch: {
    key: "warrantyBatch",
    label: "Warranty batches",
    columns: WARRANTY_BATCH_COLUMNS,
    naturalKey: "warrantyProductName+invoiceRef (create-only)",
    exportRows: exportWarrantyBatchRows,
    validateRows: validateWarrantyBatchRows,
    commitRow: commitWarrantyBatchRow,
  },
  request: {
    key: "request",
    label: "Requests",
    columns: REQUEST_COLUMNS,
    naturalKey: "requestNumber (export-only)",
    exportRows: exportRequestRows,
    exportOnly: true,
  },
  warrantyAssignment: {
    key: "warrantyAssignment",
    label: "Warranty assignments",
    columns: WARRANTY_ASSIGNMENT_COLUMNS,
    naturalKey: "assetTag+warrantyProductName (export-only)",
    exportRows: exportWarrantyAssignmentRows,
    exportOnly: true,
  },
  productForSale: {
    key: "productForSale",
    label: "Products for sale",
    columns: PRODUCT_FOR_SALE_COLUMNS,
    naturalKey: "assetTag or itemName+location (export-only)",
    exportRows: exportProductForSaleRows,
    exportOnly: true,
  },
}

const MODULE_KEYS = new Set<ModuleKey>([
  "asset",
  "customer",
  "order",
  "supplier",
  "partner",
  "warrantyProduct",
  "warrantyBatch",
  "request",
  "warrantyAssignment",
  "productForSale",
])

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEYS.has(value as ModuleKey)
}

export async function buildExportCsv(module: ModuleKey): Promise<string> {
  const config = IMPORT_EXPORT_MODULES[module]
  const rows = await config.exportRows()
  return toCsv(config.columns, rows)
}

export function buildTemplateCsv(module: ModuleKey): string {
  const config = IMPORT_EXPORT_MODULES[module]
  return toCsv(config.columns, [])
}

// ─── Preview ──────────────────────────────────────────────────────────────
// Validates every row, stages the batch (status "pending") with the full set
// of valid rows in validRowsJson, and records one csv_import_row_error per
// invalid row. Returns a capped sample for the UI; all rows are processed and
// stored regardless of the cap.

export async function previewImport(
  module: ModuleKey,
  rows: Record<string, string>[],
  actorUserId: string | null
): Promise<PreviewSummary> {
  const config = IMPORT_EXPORT_MODULES[module]
  if (config.exportOnly || !config.validateRows) {
    throw new Error(`${config.label} is export-only — bulk import is not supported for this module.`)
  }
  const classified = await config.validateRows(db, rows)

  const validRows = classified.filter((r) => r.classification !== "error")
  const errorRows = classified.filter((r) => r.classification === "error")
  const newRows = classified.filter((r) => r.classification === "new").length
  const updateRows = classified.filter((r) => r.classification === "update").length

  const batchId = createId()
  await db.insert(csvImportBatch).values({
    id: batchId,
    module,
    status: "pending",
    totalRows: rows.length,
    successRows: 0,
    errorRows: errorRows.length,
    validRowsJson: JSON.stringify(validRows),
    createdBy: actorUserId,
  })

  if (errorRows.length > 0) {
    await db.insert(csvImportRowError).values(
      errorRows.map((r) => ({
        id: createId(),
        batchId,
        rowNumber: r.rowNumber,
        rawRowJson: JSON.stringify(r.raw),
        errorMessage: r.error ?? "Invalid row",
      }))
    )
  }

  const sample = classified.slice(0, PREVIEW_SAMPLE_CAP)

  return {
    batchId,
    totalRows: rows.length,
    newRows,
    updateRows,
    errorRows: errorRows.length,
    sample,
    truncated: classified.length > PREVIEW_SAMPLE_CAP,
  }
}

// ─── Commit ───────────────────────────────────────────────────────────────
// Re-reads the staged valid rows and replays every one of them through the
// module's Core function inside a SINGLE transaction — if any row fails, the
// whole batch is rolled back (abort-whole-transaction-on-any-failure), same
// safety createAssetCore's callers already rely on for atomic multi-row
// writes (e.g. saveOrderUnits).

export async function commitImport(module: ModuleKey, batchId: string, actorUserId: string | null): Promise<CommitSummary> {
  const config = IMPORT_EXPORT_MODULES[module]
  const [batch] = await db.select().from(csvImportBatch).where(eq(csvImportBatch.id, batchId))
  if (!batch) throw new Error("Import batch not found")
  if (batch.module !== module) throw new Error("Batch does not belong to this module")
  if (batch.status !== "pending") throw new Error(`Batch already ${batch.status}`)

  if (config.exportOnly || !config.commitRow) {
    throw new Error(`${config.label} is export-only — bulk import is not supported for this module.`)
  }
  const commitRow = config.commitRow

  const validRows: ImportRow[] = batch.validRowsJson ? JSON.parse(batch.validRowsJson) : []

  try {
    await db.transaction(async (tx) => {
      for (const row of validRows) {
        await commitRow(tx, row, actorUserId)
      }
      await tx
        .update(csvImportBatch)
        .set({
          status: "committed",
          successRows: validRows.length,
          committedAt: Date.now(),
        })
        .where(eq(csvImportBatch.id, batchId))
    })
  } catch (error) {
    await db
      .update(csvImportBatch)
      .set({ status: "failed" })
      .where(eq(csvImportBatch.id, batchId))
    return {
      batchId,
      totalRows: batch.totalRows,
      successRows: 0,
      errorRows: batch.totalRows - batch.errorRows,
      status: "failed",
      error: error instanceof Error ? error.message : "Commit failed",
    }
  }

  return {
    batchId,
    totalRows: batch.totalRows,
    successRows: validRows.length,
    errorRows: batch.errorRows,
    status: "committed",
  }
}
