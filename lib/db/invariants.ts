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

export type AllocationDrift = {
  id: string
  assetTag: string | null
  serialNumber: string | null
  status: string
  currentOrderId: string | null
  currentRequestId: string | null
}

/**
 * Contradictions inside the current-allocation family.
 *
 * The legal states are:
 *   • in the warehouse, unspoken for — no request, no order
 *   • in the warehouse, reserved for an order — order set, no request yet
 *     (this is what lending free stock to an order line does)
 *   • out with a customer — request AND order both set
 *
 * So exactly two shapes are impossible, and both make a device misreport where
 * it physically is:
 *   • a warehouse device attached to a live request
 *   • a device out with a customer that names no request
 *
 * "Out with a customer but naming no ORDER" is deliberately NOT here: that is
 * the legacy state of every device delivered before the allocation columns
 * existed, and it is cleared by scripts/backfill-current-allocation.mts. Listing
 * it as a violation would make this audit cry wolf on a healthy database, and an
 * audit that always fails is an audit nobody runs.
 */
export async function findAllocationDrift(db: Db): Promise<AllocationDrift[]> {
  const rows = await db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      currentOrderId: orderUnits.currentOrderId,
      currentRequestId: orderUnits.currentRequestId,
    })
    .from(orderUnits)
    .where(
      or(
        and(
          // Only the states where the device is physically in the warehouse and
          // could therefore be double-booked. Terminal states (sold/retired/lost)
          // have left the fleet, and the request they last travelled on is
          // harmless history there — flagging it would bury the real cases.
          sql`${orderUnits.status} in ('in_stock', 'returned')`,
          sql`${orderUnits.currentRequestId} is not null`,
        ),
        and(
          sql`${orderUnits.status} in ('assigned', 'delivered')`,
          isNull(orderUnits.currentRequestId),
        ),
      ),
    )
  return rows
}

export type PendingAllocationBackfill = { outWithoutOrder: number }

/**
 * How many devices are out with a customer but do not yet name the order they
 * are serving — i.e. how much of the allocation backfill is still outstanding.
 * Informational, not a violation: it is the pre-backfill legacy state, and it
 * only means order rollups still read those devices by origin.
 */
export async function countPendingAllocationBackfill(db: Db): Promise<PendingAllocationBackfill> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orderUnits)
    .where(
      and(
        sql`${orderUnits.status} in ('assigned', 'delivered')`,
        isNull(orderUnits.currentOrderId),
      ),
    )
  return { outWithoutOrder: Number(row?.n ?? 0) }
}

export type OriginRewrite = {
  id: string
  serialNumber: string | null
  orderId: string | null
  orderLineId: string | null
}

/**
 * A device's origin order and origin line must belong to each other. Rewriting
 * order_id to lend a device out (the mistake that erased two orders' device
 * history on 2026-08-23) leaves the pair inconsistent, so this catches any
 * repeat — whether from a script or a future code path.
 */
export async function findOriginMismatches(db: Db): Promise<OriginRewrite[]> {
  const rows = await db
    .select({
      id: orderUnits.id,
      serialNumber: orderUnits.serialNumber,
      orderId: orderUnits.orderId,
      orderLineId: orderUnits.orderLineId,
    })
    .from(orderUnits)
    .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .where(and(sql`${orderUnits.orderId} is not null`, ne(orderLines.orderId, orderUnits.orderId)))
  return rows
}
