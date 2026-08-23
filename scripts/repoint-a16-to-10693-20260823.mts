/**
 * One-off prod correction (2026-08-23). Twelve iPad A16 rental units came back
 * from customers on orders 10697 (7 units) and 10692 (5 units) and were
 * restocked to "in_stock" via the UI. They stayed pinned to their originating
 * order lines, so no other order's picker can see them: getAvailableOrderUnitsCore
 * offers only (a) this order's own units, (b) units from the order's PO chain,
 * and (c) free stock — and free stock requires a purchase_order_line_id, which
 * these manually-entered units do not have.
 *
 * This script repoints all twelve onto order 10693's iPad A16 line so JeelPay's
 * order can draw them, recording a "correction" asset_event per unit.
 *
 * Units are NOT detached from a line: brand/model are null on these rows, so a
 * line-less unit would render with a blank name. The general fix — freeing a
 * returned unit from its order — remains the follow-up code change (same note
 * as scripts/fix-10716-restock-repoint.mts).
 *
 * Preconditions asserted before any write:
 *   - every serial exists, is status "in_stock", kind "rental"
 *   - no unit is attached to a live request or customer
 *   - the target line belongs to 10693 and is type "rental_asset"
 *   - the target line has room (assigned+delivered+incoming <= quantity)
 *
 * Run: npx tsx scripts/repoint-a16-to-10693-20260823.mts [--apply]
 */
import { config } from "dotenv"
config({ path: ".env.production.backup" })

const { db } = await import("../lib/db")
const { orderUnits, assetEvents, orders, orderLines } = await import("../lib/db/schema")
const { eq, and, inArray } = await import("drizzle-orm")
const { createId } = await import("../lib/utils/ids")

const APPLY = process.argv.includes("--apply")
const TARGET_ORDER = "10693"
const TARGET_LINE_ID = "rs4zcdihspk66cp46163uhbq" // Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB

const SERIALS = [
  // from order 10697 (TAM) — delivered 2026-08-05, returned 2026-08-12
  "K762L65VX4", "DRXXDV40N0", "C595K6LPXL", "L4XXF4Y9X1",
  "G926WWK9YJ", "J270FM0XYX", "J97TG9103H",
  // from order 10692 (LeanNode) — order fulfilled
  "J0FPWPC2Y5", "GKVXFYD9WD", "K9Y05H2WQR", "CY9JVNV645", "M71HDQLQW6",
]

const [target] = await db.select().from(orders).where(eq(orders.orderNumber, TARGET_ORDER))
if (!target) throw new Error(`order ${TARGET_ORDER} not found`)

const [line] = await db.select().from(orderLines).where(eq(orderLines.id, TARGET_LINE_ID))
if (!line) throw new Error(`line ${TARGET_LINE_ID} not found`)
if (line.orderId !== target.id) throw new Error(`line ${TARGET_LINE_ID} does not belong to ${TARGET_ORDER}`)
if (line.type !== "rental_asset") throw new Error(`line is ${line.type}, expected rental_asset`)

const units = await db.select().from(orderUnits)
  .where(inArray(orderUnits.serialNumber, SERIALS))

if (units.length !== SERIALS.length) {
  const found = new Set(units.map((u) => (u.serialNumber ?? "").trim()))
  throw new Error(`expected ${SERIALS.length} units, found ${units.length}; missing: ${SERIALS.filter((s) => !found.has(s)).join(", ")}`)
}

for (const u of units) {
  const s = (u.serialNumber ?? "").trim()
  if (u.status !== "in_stock") throw new Error(`${s} is ${u.status}, expected in_stock`)
  if (u.kind !== "rental") throw new Error(`${s} is kind=${u.kind}, expected rental`)
  if (u.currentRequestId) throw new Error(`${s} is still attached to request ${u.currentRequestId}`)
  if (u.currentCustomerId) throw new Error(`${s} is still attached to customer ${u.currentCustomerId}`)
  if (u.orderId === target.id) throw new Error(`${s} is already on ${TARGET_ORDER}`)
}

// Capacity check against the target line.
const onLine = await db.select().from(orderUnits).where(eq(orderUnits.orderLineId, TARGET_LINE_ID))
const occupying = onLine.filter((u) => !["retired", "sold", "lost", "supplier_returned"].includes(u.status)).length
console.log(`target line: qty ${line.quantity}, currently occupied by ${occupying} units, adding ${units.length}`)
if (occupying + units.length > (line.quantity ?? 0)) {
  throw new Error(`capacity exceeded: ${occupying} + ${units.length} > ${line.quantity}`)
}

console.log(`\nrepointing ${units.length} units -> order ${TARGET_ORDER} / line ${TARGET_LINE_ID}`)
for (const u of units) {
  console.log(`  ${(u.serialNumber ?? "").trim().padEnd(12)} ${u.status.padEnd(9)} order ${u.orderId} -> ${target.id}`)
}

if (!APPLY) {
  console.log("\nDRY RUN — all preconditions passed. Re-run with --apply to write.")
  process.exit(0)
}

await db.transaction(async (tx) => {
  for (const u of units) {
    const serial = (u.serialNumber ?? "").trim()
    const fromOrderId = u.orderId
    const res = await tx
      .update(orderUnits)
      .set({ orderId: target.id, orderLineId: TARGET_LINE_ID, kind: "rental", updatedAt: Date.now() })
      .where(and(eq(orderUnits.id, u.id), eq(orderUnits.status, "in_stock")))
    if (((res as { rowsAffected?: number }).rowsAffected ?? 1) === 0) {
      throw new Error(`repoint of ${serial} affected 0 rows — aborting`)
    }
    await tx.insert(assetEvents).values({
      id: createId(),
      assetId: u.id,
      type: "correction",
      fromStatus: null,
      toStatus: null,
      notes: `Reallocated from order ${fromOrderId} to order ${TARGET_ORDER} (line ${TARGET_LINE_ID}) — returned-stock reuse correction 2026-08-23`,
    })
    console.log(`repointed ${serial}`)
  }
})

const after = await db
  .select({ serial: orderUnits.serialNumber, status: orderUnits.status, orderId: orderUnits.orderId, lineId: orderUnits.orderLineId })
  .from(orderUnits)
  .where(inArray(orderUnits.id, units.map((u) => u.id)))
console.table(after.map((u) => ({ ...u, onTarget: u.orderId === target.id && u.lineId === TARGET_LINE_ID })))
