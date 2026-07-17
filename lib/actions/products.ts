// Products-for-sale read model. A "product for sale" is anything KARA sells to
// a customer (ownership transfers, never returns), regardless of serialization:
//
//   • Serialized sold products  → order_unit rows with kind = "sale"
//     (Samsung phones, screens — one row per physical unit, own serial/tag,
//     full asset_event history, warranty, supplier-return support).
//   • Non-serialized sold products → the quantity-stock tables (accessory_stock
//     / accessory_item), e.g. Type-C chargers counted by qty at a location.
//
// This module is the single read entry point the Products-for-sale page uses;
// it never touches the rental pool (kind = "rental"), which stays on the Assets
// page. Serialization does NOT decide the bucket — kind does.
"use server"

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { accessoryItems, accessoryStock } from "@/lib/db/schema"
import { getStaffSession } from "@/lib/auth/session"
import { getAssets, type AssetFilters } from "@/lib/actions/assets"

// Serialized products for sale — thin wrapper over the shared order_unit reader
// pinned to kind="sale" so the two inventory pages share one query surface.
export async function getSerializedProductsForSale(
  filters: Omit<AssetFilters, "kind"> = {}
) {
  return getAssets({ ...filters, kind: "sale" })
}

// Non-serialized products for sale — quantity by item and location.
export async function getProductStock() {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select({
      id: accessoryStock.id,
      accessoryItemId: accessoryStock.accessoryItemId,
      location: accessoryStock.location,
      qty: accessoryStock.qty,
      nameEn: accessoryItems.nameEn,
      nameAr: accessoryItems.nameAr,
    })
    .from(accessoryStock)
    .innerJoin(accessoryItems, eq(accessoryStock.accessoryItemId, accessoryItems.id))
    .orderBy(desc(accessoryStock.updatedAt))
}

// Combined view for the Products-for-sale page: serialized sale units plus the
// non-serialized quantity stock, in one call.
export async function getProductsForSale(filters: Omit<AssetFilters, "kind"> = {}) {
  const [serialized, stock] = await Promise.all([
    getSerializedProductsForSale(filters),
    getProductStock(),
  ])
  return { serialized, stock }
}
