import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { orderUnits, warrantyAssignments, warrantyBatches, warrantyProducts } from "@/lib/db/schema"
import type { ColumnDef } from "./types"

// Export-only — lifecycle-gated (capacity checks live in assignWarrantyCore),
// not CSV-safe. See lib/import-export/modules.ts (exportOnly).

export const WARRANTY_ASSIGNMENT_COLUMNS: ColumnDef[] = [
  { header: "assetTag", field: "assetTag", required: false },
  { header: "warrantyProductName", field: "warrantyProductName", required: false },
  { header: "invoiceRef", field: "invoiceRef", required: false },
  { header: "status", field: "status", required: false },
  { header: "activationDueAt", field: "activationDueAt", required: false },
  { header: "startAt", field: "startAt", required: false },
  { header: "endAt", field: "endAt", required: false },
]

function toDateString(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : ""
}

export async function exportWarrantyAssignmentRows(): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({
      assetTag: orderUnits.assetTag,
      warrantyProductName: warrantyProducts.nameEn,
      invoiceRef: warrantyBatches.invoiceRef,
      status: warrantyAssignments.status,
      activationDueAt: warrantyAssignments.activationDueAt,
      startAt: warrantyAssignments.startAt,
      endAt: warrantyAssignments.endAt,
    })
    .from(warrantyAssignments)
    .innerJoin(orderUnits, eq(warrantyAssignments.assetId, orderUnits.id))
    .innerJoin(warrantyBatches, eq(warrantyAssignments.warrantyBatchId, warrantyBatches.id))
    .innerJoin(warrantyProducts, eq(warrantyBatches.warrantyProductId, warrantyProducts.id))

  return rows.map((r) => ({
    ...r,
    activationDueAt: toDateString(r.activationDueAt),
    startAt: toDateString(r.startAt),
    endAt: toDateString(r.endAt),
  }))
}
