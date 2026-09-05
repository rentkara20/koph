/**
 * One-off prod correction (2026-08-30). Order 10760 needs six rental devices:
 * four iPad Pro 11" 256GB and two iPad 10th Gen 64GB. Two iPad Pro units
 * (L20DN4C3YM, FC36T6Q093) were adopted onto the iPad 10th Gen line by mistake
 * — the adopt panel auto-selected an arbitrary first line and accepted a
 * mismatched model with no warning — which filled that line to 2/2 and left
 * the two real iPad 10th Gen units with nowhere to go.
 *
 * This script:
 *   1. repoints the two iPad Pro units onto the iPad Pro line, recording a
 *      "correction" asset_event for the reallocation;
 *   2. adopts HM96KKH7NW + MXJK04CDFC onto the now-free iPad 10th Gen line
 *      through adoptUnitsIntoOrderLineCore, exactly as the UI would.
 *
 * Origin (order_unit.order_id) is never touched — only the current allocation.
 *
 * Run: npx tsx scripts/fix-10760-line-allocation-20260830.mts [--apply]
 */
import { config } from "dotenv"
config({ path: ".env.production.backup" })

const { db } = await import("../lib/db")
const { orderUnits, orderLines, orders, assetEvents } = await import("../lib/db/schema")
const { adoptUnitsIntoOrderLineCore } = await import("../lib/actions/order-unit-adoption-core")
const { eq, and, inArray, sql } = await import("drizzle-orm")
const { createId } = await import("../lib/utils/ids")

const APPLY = process.argv.includes("--apply")
const ORDER_NUMBER = "10760"
const MISPLACED = ["L20DN4C3YM", "FC36T6Q093"] // iPad Pro units sitting on the iPad 10th Gen line
const TO_ADOPT = ["HM96KKH7NW", "MXJK04CDFC"] // the real iPad 10th Gen units
const PRO_LINE = "x95j53f1d3dojoyew5z839hu"
const GEN10_LINE = "yviof114grfh0y4sgz95bzhn"

const [order] = await db.select().from(orders).where(eq(orders.orderNumber, ORDER_NUMBER))
if (!order) throw new Error(`order ${ORDER_NUMBER} not found`)

const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id))
for (const [id, label] of [[PRO_LINE, "iPad Pro"], [GEN10_LINE, "iPad 10th Gen"]] as const) {
  const line = lines.find((l) => l.id === id)
  if (!line) throw new Error(`${label} line ${id} not on order ${ORDER_NUMBER}`)
  if (line.type !== "rental_asset") throw new Error(`${label} line is ${line.type}, expected rental_asset`)
  console.log(`${label} line: qty ${line.quantity} — ${line.description}`)
}

const bySerial = async (serials: string[]) => {
  const rows = await db
    .select()
    .from(orderUnits)
    .where(inArray(sql`lower(trim(${orderUnits.serialNumber}))`, serials.map((s) => s.toLowerCase())))
  if (rows.length !== serials.length) throw new Error(`expected ${serials.length} units, found ${rows.length}`)
  return rows
}

const misplaced = await bySerial(MISPLACED)
for (const u of misplaced) {
  if (u.currentOrderId !== order.id) throw new Error(`${u.serialNumber} is not allocated to ${ORDER_NUMBER}`)
  if (u.currentOrderLineId !== GEN10_LINE) throw new Error(`${u.serialNumber} is not on the iPad 10th Gen line`)
  if (u.status !== "in_stock") throw new Error(`${u.serialNumber} is "${u.status}", expected "in_stock"`)
  console.log(`move ${u.serialNumber}: iPad 10th Gen line -> iPad Pro line`)
}

const toAdopt = await bySerial(TO_ADOPT)
for (const u of toAdopt) {
  if (u.status !== "in_stock") throw new Error(`${u.serialNumber} is "${u.status}", expected "in_stock"`)
  if (u.currentOrderId) throw new Error(`${u.serialNumber} is already allocated to another order`)
  if (u.kind !== "rental") throw new Error(`${u.serialNumber} is kind "${u.kind}", expected "rental"`)
  console.log(`adopt ${u.serialNumber} -> iPad 10th Gen line`)
}

if (!APPLY) {
  console.log("\ndry run — rerun with --apply")
  process.exit(0)
}

await db.transaction(async (tx) => {
  for (const u of misplaced) {
    const res = await tx
      .update(orderUnits)
      .set({ currentOrderLineId: PRO_LINE, updatedAt: Date.now() })
      .where(and(eq(orderUnits.id, u.id), eq(orderUnits.currentOrderLineId, GEN10_LINE)))
    if (((res as { rowsAffected?: number }).rowsAffected ?? 1) === 0) {
      throw new Error(`${u.serialNumber} moved by someone else — aborting`)
    }
    await tx.insert(assetEvents).values({
      id: createId(),
      assetId: u.id,
      type: "correction",
      fromStatus: null,
      toStatus: null,
      notes: `Reallocated from order line ${GEN10_LINE} to ${PRO_LINE} on order ${ORDER_NUMBER}: unit is an iPad Pro and was adopted onto the iPad 10th Gen line by mistake (correction 2026-08-30).`,
      byUserId: null,
    })
    console.log(`moved ${u.serialNumber}`)
  }

  await adoptUnitsIntoOrderLineCore(tx, order.id, GEN10_LINE, toAdopt.map((u) => u.id))
  console.log(`adopted ${TO_ADOPT.join(", ")}`)
})

const final = await db
  .select({ serial: orderUnits.serialNumber, line: orderUnits.currentOrderLineId })
  .from(orderUnits)
  .where(eq(orderUnits.currentOrderId, order.id))
console.table(
  final.map((u) => ({
    serial: u.serial,
    line: u.line === PRO_LINE ? "iPad Pro" : u.line === GEN10_LINE ? "iPad 10th Gen" : u.line,
  })),
)
