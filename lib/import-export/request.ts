import { eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, requestTypes, requests } from "@/lib/db/schema"
import type { ColumnDef } from "./types"

// Export-only — request creation involves tracking-code generation,
// delivery-part-number sequencing, and asset-transition side effects that
// make bulk CSV write unsafe. See lib/import-export/modules.ts (exportOnly).

export const REQUEST_COLUMNS: ColumnDef[] = [
  { header: "requestNumber", field: "requestNumber", required: false },
  { header: "trackingCode", field: "trackingCode", required: false },
  { header: "customerName", field: "customerName", required: false },
  { header: "requestType", field: "requestType", required: false },
  { header: "quoteNumber", field: "quoteNumber", required: false },
  { header: "poNumber", field: "poNumber", required: false },
  { header: "deliveryDate", field: "deliveryDate", required: false },
  { header: "collectionDate", field: "collectionDate", required: false },
  { header: "status", field: "status", required: false },
  { header: "origin", field: "origin", required: false },
  { header: "destination", field: "destination", required: false },
  { header: "notes", field: "notes", required: false },
]

function toDateString(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : ""
}

export async function exportRequestRows(): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({
      requestNumber: requests.requestNumber,
      trackingCode: requests.trackingCode,
      customerName: customers.name,
      requestType: requestTypes.nameEn,
      quoteNumber: requests.quoteNumber,
      poNumber: requests.poNumber,
      deliveryDate: requests.deliveryDate,
      collectionDate: requests.collectionDate,
      status: requests.status,
      origin: requests.origin,
      destination: requests.destination,
      notes: requests.notes,
    })
    .from(requests)
    .innerJoin(customers, eq(requests.customerId, customers.id))
    .innerJoin(requestTypes, eq(requests.typeId, requestTypes.id))
    .where(isNull(requests.deletedAt))

  return rows.map((r) => ({
    ...r,
    deliveryDate: toDateString(r.deliveryDate),
    collectionDate: toDateString(r.collectionDate),
  }))
}
