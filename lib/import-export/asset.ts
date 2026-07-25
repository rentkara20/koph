import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, orderLines, orderUnits, suppliers } from "@/lib/db/schema"
import { createAssetCore, updateAssetImportCore } from "@/lib/actions/assets"
import type { ColumnDef, ImportRow } from "./types"

// Db-injectable, matching lib/actions/customers.ts's searchCustomersCore
// convention — lets validateAssetRows run against an ephemeral test db.
type Database = typeof db

// ─── Column definition (drives template header row + parse/validation) ──────
// Internal FK ids (orderLineId, purchaseOrderId, currentCustomerId, ...) are
// intentionally skipped — see project brief. New rows are created as
// standalone assets (no client-order/PO origin); see createAssetCore's
// `standalone` flag.

// Import + round-trip columns. Every field here is owned by the order_unit row
// itself, so import parses it directly and export emits it unchanged. Device
// identity (brand/model/deviceType) and cost/procurement refs
// (warrantyCost/invoiceNo/sourceOrderNo) are back-fillable for legacy devices
// that have no origin order/PO line — see order_unit schema.
export const ASSET_COLUMNS: ColumnDef[] = [
  { header: "assetTag", field: "assetTag", required: false },
  { header: "serialNumber", field: "serialNumber", required: false },
  { header: "brand", field: "brand", required: false },
  { header: "model", field: "model", required: false },
  { header: "deviceType", field: "deviceType", required: false },
  { header: "kind", field: "kind", required: false },
  { header: "status", field: "status", required: false },
  { header: "location", field: "location", required: false },
  { header: "purchaseCost", field: "purchaseCost", required: false },
  { header: "warrantyCost", field: "warrantyCost", required: false },
  { header: "purchaseDate", field: "purchaseDate", required: false },
  { header: "warrantyEnd", field: "warrantyEnd", required: false },
  { header: "invoiceNo", field: "invoiceNo", required: false },
  { header: "sourceOrderNo", field: "sourceOrderNo", required: false },
  { header: "notes", field: "notes", required: false },
]

// Export adds read-only, derived-at-export-time columns on top of the
// round-trip set: supplier + current client resolved to their names, and Total
// Cost computed (device + warranty). These are intentionally NOT in
// ASSET_COLUMNS — they are never parsed back on import (supplier/client are
// managed relations, totalCost is derived). See ModuleConfig.exportColumns.
export const ASSET_EXPORT_COLUMNS: ColumnDef[] = [
  ...ASSET_COLUMNS,
  { header: "supplier", field: "supplier", required: false },
  { header: "totalCost", field: "totalCost", required: false },
  { header: "currentClient", field: "currentClient", required: false },
]

export async function exportAssetRows(): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      brand: orderUnits.brand,
      model: orderUnits.model,
      deviceType: orderUnits.deviceType,
      kind: orderUnits.kind,
      status: orderUnits.status,
      location: orderUnits.location,
      purchaseCost: orderUnits.purchaseCost,
      warrantyCost: orderUnits.warrantyCost,
      purchaseDate: orderUnits.purchaseDate,
      warrantyEnd: orderUnits.warrantyEnd,
      invoiceNo: orderUnits.invoiceNo,
      sourceOrderNo: orderUnits.sourceOrderNo,
      notes: orderUnits.notes,
      supplier: suppliers.name,
      currentClient: customers.name,
      // Fallback source for assets whose device identity was never back-filled
      // onto order_unit — most existing assets, which came from a client order
      // line rather than the CSV importer. The line's free-text description
      // ("ThinkPad L14, U7-255U, Ram 32GB, ...") is the closest thing KOPH has
      // to a device spec for these, so it stands in for a blank model.
      lineBrand: orderLines.brand,
      lineModel: orderLines.model,
      lineDescription: orderLines.description,
    })
    .from(orderUnits)
    .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
    .leftJoin(customers, eq(orderUnits.currentCustomerId, customers.id))
    .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
  return rows.map((r) => ({
    ...r,
    brand: r.brand || r.lineBrand || "",
    model: r.model || r.lineModel || r.lineDescription || "",
    purchaseDate: r.purchaseDate ? toDateString(r.purchaseDate) : "",
    warrantyEnd: r.warrantyEnd ? toDateString(r.warrantyEnd) : "",
    // Total Cost is DERIVED, never stored. Blank when both parts are absent so
    // an untouched legacy row doesn't read as "0".
    totalCost:
      r.purchaseCost == null && r.warrantyCost == null
        ? ""
        : (r.purchaseCost ?? 0) + (r.warrantyCost ?? 0),
    supplier: r.supplier ?? "",
    currentClient: r.currentClient ?? "",
  }))
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function parseDate(value: string, field: string): number | undefined {
  if (!value) return undefined
  const t = new Date(`${value}T00:00:00Z`).getTime()
  if (!Number.isFinite(t)) throw new Error(`Invalid ${field}: "${value}" (expected YYYY-MM-DD)`)
  return t
}

function parseNumber(value: string, field: string): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`Invalid ${field}: "${value}" (expected a number)`)
  return n
}

const VALID_KINDS = new Set(["rental", "sale"])
// Statuses a CSV row is allowed to set. Anything else is a lifecycle
// transition guarded by applyAssetTransition/OI-1 and must go through the UI,
// not a bulk import — see updateAssetImportCore's doc comment.
const NEW_ROW_ALLOWED_STATUS = new Set(["in_stock", ""])

// Validates + classifies every parsed CSV row against current DB state.
// Read-only: does not write anything (writes happen at commit via Core fns).
export async function validateAssetRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const existing = await database
    .select({ id: orderUnits.id, assetTag: orderUnits.assetTag, status: orderUnits.status })
    .from(orderUnits)
  const byTag = new Map(existing.filter((e) => e.assetTag).map((e) => [e.assetTag as string, e]))

  const seenSerials = new Set<string>()
  const existingSerials = new Set(
    (
      await database
        .select({ serialNumber: orderUnits.serialNumber })
        .from(orderUnits)
        .where(sql`${orderUnits.serialNumber} IS NOT NULL`)
    )
      .map((r) => r.serialNumber?.trim().toLowerCase())
      .filter((s): s is string => Boolean(s))
  )

  const results: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2 // account for header row, 1-indexed data rows
    try {
      const assetTag = raw.assetTag?.trim() || undefined
      const serialNumber = raw.serialNumber?.trim() || undefined
      const kind = raw.kind?.trim() || "rental"
      const status = raw.status?.trim() || ""
      const location = raw.location?.trim() || undefined
      const notes = raw.notes?.trim() || undefined
      const brand = raw.brand?.trim() || undefined
      const model = raw.model?.trim() || undefined
      const deviceType = raw.deviceType?.trim() || undefined
      const invoiceNo = raw.invoiceNo?.trim() || undefined
      const sourceOrderNo = raw.sourceOrderNo?.trim() || undefined

      if (kind && !VALID_KINDS.has(kind)) throw new Error(`Invalid kind: "${kind}"`)
      const purchaseCost = parseNumber(raw.purchaseCost?.trim() ?? "", "purchaseCost")
      const warrantyCost = parseNumber(raw.warrantyCost?.trim() ?? "", "warrantyCost")
      const purchaseDate = parseDate(raw.purchaseDate?.trim() ?? "", "purchaseDate")
      const warrantyEnd = parseDate(raw.warrantyEnd?.trim() ?? "", "warrantyEnd")

      if (serialNumber) {
        const key = serialNumber.toLowerCase()
        if (seenSerials.has(key)) throw new Error(`Duplicate serial number in file: ${serialNumber}`)
        seenSerials.add(key)
      }

      const matched = assetTag ? byTag.get(assetTag) : undefined

      if (matched) {
        if (serialNumber && existingSerials.has(serialNumber.toLowerCase())) {
          // Allow the row to "clash" with its own existing serial (no-op update).
          const [self] = await database
            .select({ id: orderUnits.id })
            .from(orderUnits)
            .where(sql`lower(trim(${orderUnits.serialNumber})) = ${serialNumber.toLowerCase()}`)
          if (self && self.id !== matched.id) {
            throw new Error(`Serial number already in use by another asset: ${serialNumber}`)
          }
        }
        if (status && status !== matched.status) {
          throw new Error(
            `Status changes are not supported via CSV import (asset is "${matched.status}", file requests "${status}"). Use the asset page.`
          )
        }
        results.push({
          rowNumber,
          raw,
          classification: "update",
          matchedId: matched.id,
          input: {
            serialNumber,
            location,
            purchaseCost,
            warrantyCost,
            purchaseDate,
            warrantyEnd,
            notes,
            brand,
            model,
            deviceType,
            invoiceNo,
            sourceOrderNo,
          },
        })
        continue
      }

      if (!assetTag) {
        throw new Error("assetTag is required for new asset rows")
      }
      if (status && !NEW_ROW_ALLOWED_STATUS.has(status)) {
        throw new Error(
          `New assets can only be imported as "in_stock" (file requests "${status}"). Use the asset page to change status afterwards.`
        )
      }
      if (serialNumber && existingSerials.has(serialNumber.toLowerCase())) {
        throw new Error(`Serial number already in use: ${serialNumber}`)
      }

      results.push({
        rowNumber,
        raw,
        classification: "new",
        input: {
          assetTag,
          serialNumber,
          kind,
          location,
          purchaseCost,
          warrantyCost,
          purchaseDate,
          warrantyEnd,
          notes,
          brand,
          model,
          deviceType,
          invoiceNo,
          sourceOrderNo,
          standalone: true,
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

export async function commitAssetRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  if (row.classification === "new") {
    await createAssetCore(tx, row.input as never, actorUserId)
  } else if (row.classification === "update" && row.matchedId) {
    await updateAssetImportCore(tx, row.matchedId, row.input as never)
  }
}
