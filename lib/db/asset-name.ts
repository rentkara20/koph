import { sql, type SQL, type SQLWrapper } from "drizzle-orm"
import { orderUnits } from "@/lib/db/schema"

// ─── Device display name / brand resolution ──────────────────────────────────
// An asset's shown name comes from the description of the order line or PO line
// it was minted from — but that line describes EVERY sibling unit, so it cannot
// carry a correction for one device. order_unit.brand/model are the per-asset
// device fields (free text, one Model field — see the asset-export design), so
// they win when set and the line text stays as the fallback for the untouched
// majority. Callers must join whichever origin tables they pass as fallbacks.

function coalesceOverride(override: SQLWrapper, fallbacks: SQLWrapper[]): SQL<string> {
  return sql<string>`coalesce(nullif(trim(${override}), ''), ${sql.join(fallbacks, sql`, `)})`
}

export function assetDisplayNameSql(...lineDescriptions: [SQLWrapper, ...SQLWrapper[]]): SQL<string> {
  return coalesceOverride(orderUnits.model, lineDescriptions)
}

export function assetBrandSql(...lineBrands: [SQLWrapper, ...SQLWrapper[]]): SQL<string | null> {
  return coalesceOverride(orderUnits.brand, lineBrands)
}

export function assetModelSql(...lineModels: [SQLWrapper, ...SQLWrapper[]]): SQL<string | null> {
  return coalesceOverride(orderUnits.model, lineModels)
}
