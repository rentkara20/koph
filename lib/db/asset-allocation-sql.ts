import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm"
import { orderUnits } from "@/lib/db/schema"

// "Which devices is this order using right now?"
//
// order_unit carries two different order references and conflating them is the
// bug this file exists to prevent:
//   • orderId / orderLineId        — the ORIGIN. Where the device entered the
//     fleet. Immutable: the order it was first sold on keeps its records for the
//     life of the device.
//   • currentOrderId / currentOrderLineId — the CURRENT allocation, maintained
//     by applyAssetTransition (set on assign, cleared on return/restock).
//
// A device is serving an order when it is allocated to it. When a device has no
// allocation at all, its origin order still shows it — that is the pre-existing
// behaviour every order relied on before allocations were recorded, and it keeps
// historical orders (whose devices were never re-lent) reading exactly as before.
export function servingOrder(orderId: string): SQL<unknown> {
  return or(
    eq(orderUnits.currentOrderId, orderId),
    and(isNull(orderUnits.currentOrderId), eq(orderUnits.orderId, orderId)),
  )!
}

// "Which devices count toward this order?" — the UNION of the two references.
//
// Deliberately wider than servingOrder: a device this order bought stays counted
// even while it is lent out, and a device borrowed from stock counts too. Rollups
// (order status, progress, linked requests) must use this, because a rollup that
// silently loses rows silently rewrites history — an order whose devices were all
// lent elsewhere would recompute to "draft", i.e. never fulfilled at all.
//
// The narrower servingOrder is for "what is out with THIS order's customer right
// now" (e.g. prefilling a collection receipt), where counting a device that is
// with somebody else would be a real operational error.
export function attributedToOrder(orderId: string): SQL<unknown> {
  return or(eq(orderUnits.orderId, orderId), eq(orderUnits.currentOrderId, orderId))!
}

// Same rule at line granularity, for per-line coverage counts.
export function servingOrderLine(orderLineId: string): SQL<unknown> {
  return or(
    eq(orderUnits.currentOrderLineId, orderLineId),
    and(isNull(orderUnits.currentOrderLineId), eq(orderUnits.orderLineId, orderLineId)),
  )!
}

// Whether the device's ORIGIN still has a claim on it.
//
// A device minted against an order line — or received through a purchase order
// bought for a specific customer order — is committed stock until it has been
// out and come back: that order is waiting on it, and lending it elsewhere would
// starve the order that paid for it. Once a "returned" event exists, the origin
// is history and the device is fungible warehouse stock. A device with no origin
// at all (CSV back-fill) was never committed to anyone.
//
// This is the rule that lets origin stay immutable: instead of rewriting
// order_id to signal "no longer needed here", we ask the ledger.
export function originClaimReleased(): SQL<unknown> {
  return sql`(
    exists (select 1 from asset_event ae where ae.asset_id = ${orderUnits.id} and ae.type = 'returned')
    or (${orderUnits.orderLineId} is null and ${orderUnits.purchaseOrderLineId} is null)
  )`
}

// A device nobody is using: in the warehouse, rental, no allocation of any kind,
// and no outstanding claim from where it came from.
export function unallocatedRentalStock(): SQL<unknown> {
  return and(
    eq(orderUnits.status, "in_stock"),
    eq(orderUnits.kind, "rental"),
    isNull(orderUnits.currentRequestId),
    isNull(orderUnits.currentOrderId),
    isNull(orderUnits.currentCustomerId),
    originClaimReleased(),
  )!
}
