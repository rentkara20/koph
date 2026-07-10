// Asset-first domain type (Milestone 2 / B2). `order_unit` remains the
// physical table — this is a naming abstraction so callers can start thinking
// and writing "Asset" without a table rename. See lib/actions/asset-transition.ts
// for the status-change chokepoint and lib/actions/assets.ts for creation/queries.
import type { orderUnits } from "@/lib/db/schema"

export type Asset = typeof orderUnits.$inferSelect
export type NewAsset = typeof orderUnits.$inferInsert
