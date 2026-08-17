// Cross-table invariants that no single write path can enforce on its own.
//
// These exist because the expensive failures in this system are silent ones: a
// row that is individually valid but contradicts a row it depends on. Nothing
// throws, no page 500s, a button simply stops appearing. Each check here is a
// query that must return zero rows, usable from a test (as a regression gate)
// or against production (as an audit).

import { and, eq, isNull, ne, notInArray, or, sql } from "drizzle-orm"
import type { drizzle } from "drizzle-orm/libsql"
import {
  orderLines,
  orderUnits,
  partnerPaymentDecisions,
  partnerPayments,
  partners,
  partnerTasks,
} from "@/lib/db/schema"
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

export type UnpaidClosedTask = {
  id: string
  partnerName: string | null
  closedAt: number | null
  decision: string | null
}

/**
 * A closed partner task must end with either a payment row or a deliberate
 * "don't pay" decision. Neither one present means the partner did the trip and
 * nothing in the system owes them anything.
 *
 * Why this is a silent failure rather than a visible one: sign-off writes the
 * decision record and the payment row in the same step, but the payment side
 * needs a partner contract to price against. With no contract the decision is
 * still recorded, the task still closes, the UI shows a completed job — and no
 * payment line is ever created. Nothing errors. The money is simply never owed,
 * and it surfaces only when a partner asks why an old trip was not in a batch.
 *
 * `none` and `hold` are deliberate calls, not stalls, so a task carrying either
 * is out of scope. Supplier pickups close via warehouse receipt and are never
 * paid through this path, so they are excluded too — including them would make
 * the check fail permanently on correct data, which is how a check stops being
 * run at all.
 */
export async function findClosedTasksWithoutPayment(db: Db): Promise<UnpaidClosedTask[]> {
  return db
    .select({
      id: partnerTasks.id,
      partnerName: partners.name,
      closedAt: partnerTasks.closedAt,
      decision: partnerPaymentDecisions.decision,
    })
    .from(partnerTasks)
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .leftJoin(partnerPayments, eq(partnerPayments.partnerTaskId, partnerTasks.id))
    .leftJoin(partnerPaymentDecisions, eq(partnerPaymentDecisions.partnerTaskId, partnerTasks.id))
    .where(
      and(
        eq(partnerTasks.status, "closed"),
        notInArray(partnerTasks.kind, ["supplier_pickup"]),
        isNull(partnerPayments.id),
        // A missing decision row is itself a violation, so the null case must be
        // kept rather than filtered out by the NOT IN — SQL's NOT IN is unknown,
        // not true, when the left side is NULL.
        or(
          isNull(partnerPaymentDecisions.id),
          notInArray(partnerPaymentDecisions.decision, ["none", "hold"])
        )
      )
    )
}
