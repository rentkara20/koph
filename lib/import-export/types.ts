// Shared types for the CSV Import/Export Center (lib/import-export/modules.ts).

export type ModuleKey =
  | "asset"
  | "customer"
  | "order"
  | "supplier"
  | "partner"
  | "warrantyProduct"
  | "warrantyBatch"
  | "request"
  | "warrantyAssignment"
  | "productForSale"

export type ColumnDef = {
  header: string
  field: string
  required: boolean
}

export type RowClassification = "new" | "update" | "error"

// One classified CSV row, produced during preview and re-consumed at commit
// time (stored as JSON on csv_import_batch.valid_rows_json for new/update
// rows; errors persist to csv_import_row_error instead).
export type ImportRow = {
  rowNumber: number
  raw: Record<string, string>
  classification: RowClassification
  error?: string
  // Present for "update" rows: the id of the existing row this CSV row maps to.
  matchedId?: string
  // Present for "new" | "update" rows: the fields ready to hand to the
  // module's Core function.
  input?: Record<string, unknown>
}

export type PreviewSummary = {
  batchId: string
  totalRows: number
  newRows: number
  updateRows: number
  errorRows: number
  // Sample rows for the UI preview table, capped — see PREVIEW_SAMPLE_CAP.
  sample: ImportRow[]
  truncated: boolean
}

export type CommitSummary = {
  batchId: string
  totalRows: number
  successRows: number
  errorRows: number
  status: "committed" | "failed"
  error?: string
}

// Returned rows are capped in the API response to keep the payload small;
// all rows are still processed/stored server-side.
export const PREVIEW_SAMPLE_CAP = 200
