import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { accessoryItems, accessoryStock, orderUnits } from "@/lib/db/schema"
import type { ColumnDef } from "./types"

// Export-only — "products for sale" is a derived read model (serialized
// order_unit rows with kind="sale", plus non-serialized accessory_stock
// quantities), not a standalone writable entity. See lib/actions/products.ts
// and lib/import-export/modules.ts (exportOnly).

export const PRODUCT_FOR_SALE_COLUMNS: ColumnDef[] = [
  { header: "type", field: "type", required: false },
  { header: "assetTag", field: "assetTag", required: false },
  { header: "serialNumber", field: "serialNumber", required: false },
  { header: "itemName", field: "itemName", required: false },
  { header: "status", field: "status", required: false },
  { header: "location", field: "location", required: false },
  { header: "qty", field: "qty", required: false },
  { header: "notes", field: "notes", required: false },
]

export async function exportProductForSaleRows(): Promise<Record<string, unknown>[]> {
  const serialized = await db
    .select({
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      location: orderUnits.location,
      notes: orderUnits.notes,
    })
    .from(orderUnits)
    .where(eq(orderUnits.kind, "sale"))

  const stock = await db
    .select({
      itemName: accessoryItems.nameEn,
      location: accessoryStock.location,
      qty: accessoryStock.qty,
    })
    .from(accessoryStock)
    .innerJoin(accessoryItems, eq(accessoryStock.accessoryItemId, accessoryItems.id))

  return [
    ...serialized.map((r) => ({
      type: "serialized",
      assetTag: r.assetTag,
      serialNumber: r.serialNumber,
      itemName: "",
      status: r.status,
      location: r.location,
      qty: "",
      notes: r.notes,
    })),
    ...stock.map((r) => ({
      type: "stock",
      assetTag: "",
      serialNumber: "",
      itemName: r.itemName,
      status: "",
      location: r.location,
      qty: r.qty,
      notes: "",
    })),
  ]
}
