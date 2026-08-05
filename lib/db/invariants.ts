// Cross-table invariants that no single write path can enforce on its own.
//
// These exist because the expensive failures in this system are silent ones: a
// row that is individually valid but contradicts a row it depends on. Nothing
// throws, no page 500s, a button simply stops appearing. Each check here is a
// query that must return zero rows, usable from a test (as a regression gate)
// or against production (as an audit).

import { and, eq, ne, sql } from "drizzle-orm"
import type { drizzle } from "drizzle-orm/libsql"
import { orderLines, orderUnits } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"

// Any libsql drizzle handle — the app's `db`, or a throwaway file DB in a test.
type Db = ReturnType<typeof drizzle<typeof schema>>

export type KindMismatch = {
  id: string
  assetTag: string | null
  serialNumber: string | null
  kind: string
  lineType: string
}

/**
 * order_unit.kind must agree with its own order_line.type: a unit on a
 * sold_product line is kind=sale, a unit on a rental_asset line is kind=rental.
 *
 * Why this matters more than it looks: kind gates the `sell` transition
 * (delivered -> sold is legal only for a sale unit) and collection readiness
 * counts only rental units. A rental device stamped "sale" therefore loses the
 * UI route back from the customer, with no error anywhere — which is exactly
 * how order 10692's five iPads got stranded (a one-off repair script widened
 * kind to buy itself a transition and never restored it).
 *
 * Units with no order-line origin (PO-origin or standalone/back-filled) have no
 * line to contradict and are out of scope.
 */
export async function findAssetKindLineTypeMismatches(db: Db): Promise<KindMismatch[]> {
  return db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      kind: orderUnits.kind,
      lineType: orderLines.type,
    })
    .from(orderUnits)
    .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .where(
      and(
        sql`${orderUnits.orderLineId} is not null`,
        ne(
          orderUnits.kind,
          sql`case when ${orderLines.type} = 'sold_product' then 'sale' else 'rental' end`
        )
      )
    )
}
