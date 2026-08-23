// Lending free warehouse stock to a client order.
//
// The gap this closes: a rental unit that goes out to a customer and comes back
// is restocked to "in_stock", but for a long time every order-facing view keyed
// off order_unit.order_id — the device's ORIGIN — so a returned device was
// physically free yet invisible to every other order. The workaround was to
// rewrite the origin, which erased the device from the history of the order it
// was first sold on. That correction was hand-scripted twice (see
// scripts/fix-10716-restock-repoint.mts and the 2026-08-23/24 repoint + revert
// pair) before being recognised as a data-destroying answer to a modelling bug.
//
// The fix is order_unit.currentOrderId / currentOrderLineId: the CURRENT
// allocation, separate from the immutable origin. Lending sets them; the asset
// chokepoint clears them on return/restock. Nothing is overwritten, so both
// orders keep their records — the origin order forever, the borrowing order for
// as long as it holds the device.
import { and, eq, isNull, ne, or, sql } from "drizzle-orm"
import type { db } from "@/lib/db"
import {
  assetEvents,
  orderLines,
  orderUnits,
  orders,
  purchaseOrderLines,
  suppliers,
} from "@/lib/db/schema"
import { assetDisplayNameSql } from "@/lib/db/asset-name"
import { servingOrderLine, unallocatedRentalStock } from "@/lib/db/asset-allocation-sql"
import { createId } from "@/lib/utils/ids"
import { OCCUPYING_ASSET_STATUSES } from "@/lib/domain/asset-status"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export class AdoptionError extends Error {}

// A unit is lendable when it is physically free in the warehouse, carries no
// current allocation, and its origin has no outstanding claim on it — the same
// rule the availability picker uses, stated once in asset-allocation-sql.
export async function getAdoptableUnitsCore(tx: Tx, orderId: string) {
  return tx
    .select({
      unitId: orderUnits.id,
      serialNumber: orderUnits.serialNumber,
      assetTag: orderUnits.assetTag,
      description: assetDisplayNameSql(orderLines.description, purchaseOrderLines.itemDescription),
      supplierName: suppliers.name,
      originOrderNumber: orders.orderNumber,
    })
    .from(orderUnits)
    .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
    .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
    .leftJoin(orders, eq(orderUnits.orderId, orders.id))
    .where(
      and(
        unallocatedRentalStock(),
        // A device whose origin is this order and which has no allocation is
        // already listed as the order's own stock; offering it again would be a
        // duplicate row in the picker.
        or(isNull(orderUnits.orderId), ne(orderUnits.orderId, orderId)),
      ),
    )
}

/**
 * Allocate free warehouse stock to one of an order's rental lines, inside the
 * caller's transaction. Throws AdoptionError on any rule violation so nothing
 * partially applies. Writes ONLY the allocation columns — origin is untouched.
 */
export async function adoptUnitsIntoOrderLineCore(
  tx: Tx,
  orderId: string,
  orderLineId: string,
  unitIds: string[],
  byUserId: string | null = null,
): Promise<{ adopted: number }> {
  const wanted = [...new Set(unitIds)]
  if (wanted.length === 0) throw new AdoptionError("No units selected")

  const [line] = await tx
    .select({ id: orderLines.id, orderId: orderLines.orderId, type: orderLines.type, quantity: orderLines.quantity })
    .from(orderLines)
    .where(eq(orderLines.id, orderLineId))
  if (!line) throw new AdoptionError("Order line not found")
  if (line.orderId !== orderId) throw new AdoptionError("Order line does not belong to this order")
  // Rental only: a sold_product line transfers ownership, and a rental asset
  // must never be re-badged as a sale unit.
  if (line.type !== "rental_asset") throw new AdoptionError("Only rental lines can borrow warehouse stock")

  // Re-derive eligibility inside the transaction — the client-side list may be
  // stale, and a unit allocated in between must not be double-booked.
  const eligible = await getAdoptableUnitsCore(tx, orderId)
  const eligibleIds = new Set(eligible.map((u) => u.unitId))
  if (wanted.some((id) => !eligibleIds.has(id))) {
    throw new AdoptionError("Some units are no longer available")
  }

  // Capacity: never let a line hold more devices than it sells.
  const [occupied] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(orderUnits)
    .where(and(servingOrderLine(orderLineId), sql`${orderUnits.status} in (${sql.join(OCCUPYING_ASSET_STATUSES.map((s) => sql`${s}`), sql`, `)})`))
  if (Number(occupied?.n ?? 0) + wanted.length > line.quantity) {
    throw new AdoptionError("Line capacity exceeded")
  }

  for (const unitId of wanted) {
    // Guarded on status AND on the allocation still being free: a racing
    // request that pulls the device flips one of them, this update affects 0
    // rows, and the whole batch aborts instead of double-booking a device.
    const res = await tx
      .update(orderUnits)
      .set({ currentOrderId: orderId, currentOrderLineId: orderLineId, updatedAt: Date.now() })
      .where(
        and(
          eq(orderUnits.id, unitId),
          eq(orderUnits.status, "in_stock"),
          isNull(orderUnits.currentOrderId),
        ),
      )
    if (((res as { rowsAffected?: number }).rowsAffected ?? 1) === 0) {
      throw new AdoptionError("Some units are no longer available")
    }

    await tx.insert(assetEvents).values({
      id: createId(),
      assetId: unitId,
      type: "note",
      fromStatus: null,
      toStatus: null,
      notes: `Allocated to order line ${orderLineId} from free warehouse stock. Origin unchanged.`,
      byUserId,
    })
  }

  return { adopted: wanted.length }
}
