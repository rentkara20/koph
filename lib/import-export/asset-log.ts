import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assetEvents, customers, orderUnits } from "@/lib/db/schema"
import type { ColumnDef } from "./types"
import { toDateInputValue } from "@/lib/utils/format"

// ─── Asset Log (Sheet 2 of the agreed asset-export design) ──────────────────
// One row per lifecycle event — the movement ledger / passport of each device,
// keyed by Serial. Export-only: events are emitted by the domain flows
// (createAssetCore, applyAssetTransition, ...), never bulk-imported. Pairs with
// the Assets export (static details + derived-at-export status).

export const ASSET_LOG_COLUMNS: ColumnDef[] = [
  { header: "serialNumber", field: "serialNumber", required: false },
  { header: "assetTag", field: "assetTag", required: false },
  { header: "event", field: "event", required: false },
  { header: "date", field: "date", required: false },
  { header: "fromStatus", field: "fromStatus", required: false },
  { header: "toStatus", field: "toStatus", required: false },
  { header: "client", field: "client", required: false },
  // Hybrid reference: a KOPH request id when the event links to one, else blank.
  // Legacy movements imported as text can be upgraded to a live link later.
  { header: "reference", field: "reference", required: false },
  { header: "note", field: "note", required: false },
]

// Riyadh calendar day, matching parseRiyadhDate on the import side.
const toDateString = toDateInputValue

export async function exportAssetLogRows(): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({
      serialNumber: orderUnits.serialNumber,
      assetTag: orderUnits.assetTag,
      event: assetEvents.type,
      date: assetEvents.createdAt,
      fromStatus: assetEvents.fromStatus,
      toStatus: assetEvents.toStatus,
      client: customers.name,
      reference: assetEvents.requestId,
      note: assetEvents.notes,
    })
    .from(assetEvents)
    .innerJoin(orderUnits, eq(assetEvents.assetId, orderUnits.id))
    .leftJoin(customers, eq(assetEvents.customerId, customers.id))
    .orderBy(desc(assetEvents.createdAt))

  return rows.map((r) => ({
    ...r,
    date: toDateString(r.date),
    serialNumber: r.serialNumber ?? "",
    assetTag: r.assetTag ?? "",
    fromStatus: r.fromStatus ?? "",
    toStatus: r.toStatus ?? "",
    client: r.client ?? "",
    reference: r.reference ?? "",
    note: r.note ?? "",
  }))
}
