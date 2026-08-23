/**
 * Reverts scripts/repoint-a16-to-10693-20260823.mts.
 *
 * That script moved twelve returned iPad A16 units from orders 10697 and 10692
 * onto order 10693 by rewriting order_unit.order_id / order_line_id. That was
 * wrong: order_id is the device's ORIGIN, and every order view keys off it, so
 * rewriting it erased the devices from the history of the two orders they were
 * actually sold on. No order data may be removed.
 *
 * This puts every unit back on its original order line. The original
 * "correction" events are kept — they happened — and a reversal event is added
 * so the timeline states plainly that the move was undone. Statuses are not
 * touched: all twelve are in_stock and stay in_stock.
 *
 * The real fix (separating origin from current allocation, so a returned device
 * can serve a new order WITHOUT its origin being rewritten) is a schema change,
 * tracked separately.
 *
 * Run: npx tsx scripts/revert-repoint-a16-20260824.mts [--apply]
 */
import { config } from "dotenv"
config({ path: ".env.production.backup" })

const { db } = await import("../lib/db")
const { orderUnits, assetEvents } = await import("../lib/db/schema")
const { eq, and, inArray } = await import("drizzle-orm")
const { createId } = await import("../lib/utils/ids")

const APPLY = process.argv.includes("--apply")

// Exact pre-move state, from the verification run before the repoint.
const ORIGIN = {
  order10697: {
    orderId: "pmnk2dtggs7eytb8928a4l0k",
    orderLineId: "jcfxd4q4zll4vxm5o76bqt7l",
    orderNumber: "10697",
    serials: ["K762L65VX4", "DRXXDV40N0", "C595K6LPXL", "L4XXF4Y9X1", "G926WWK9YJ", "J270FM0XYX", "J97TG9103H"],
  },
  order10692: {
    orderId: "km5lzt253xizwzvstatg8hui",
    orderLineId: "zcttmh9lyyr0f7obfwdcv91i",
    orderNumber: "10692",
    serials: ["J0FPWPC2Y5", "GKVXFYD9WD", "K9Y05H2WQR", "CY9JVNV645", "M71HDQLQW6"],
  },
} as const

const MOVED_TO = "ew2nase5ix819qec2urauevz" // order 10693

const allSerials = [...ORIGIN.order10697.serials, ...ORIGIN.order10692.serials]
const units = await db.select().from(orderUnits).where(inArray(orderUnits.serialNumber, allSerials))
if (units.length !== allSerials.length) {
  throw new Error(`expected ${allSerials.length} units, found ${units.length}`)
}

// Only revert what the repoint actually moved, and only if it is still free.
for (const u of units) {
  const s = (u.serialNumber ?? "").trim()
  if (u.orderId !== MOVED_TO) throw new Error(`${s} is on order ${u.orderId}, not the repointed order — refusing to guess`)
  // The devices have since been allocated to a JeelPay delivery request. That
  // allocation lives in request_item + current_request_id, NOT in order_id, so
  // restoring the origin does not disturb it. Statuses and current_request_id
  // are deliberately left untouched.
  if (!["in_stock", "assigned"].includes(u.status)) {
    throw new Error(`${s} is ${u.status} — unexpected state, revert manually`)
  }
}

const bySerial = new Map(units.map((u) => [(u.serialNumber ?? "").trim(), u]))

console.log("restoring original ownership:")
for (const group of Object.values(ORIGIN)) {
  for (const serial of group.serials) {
    console.log(`  ${serial.padEnd(12)} -> order ${group.orderNumber} / line ${group.orderLineId}`)
  }
}

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write")
  process.exit(0)
}

await db.transaction(async (tx) => {
  for (const group of Object.values(ORIGIN)) {
    for (const serial of group.serials) {
      const unit = bySerial.get(serial)!
      const res = await tx
        .update(orderUnits)
        .set({ orderId: group.orderId, orderLineId: group.orderLineId, updatedAt: Date.now() })
        .where(and(eq(orderUnits.id, unit.id), eq(orderUnits.orderId, MOVED_TO)))
      if (((res as { rowsAffected?: number }).rowsAffected ?? 1) === 0) {
        throw new Error(`revert of ${serial} affected 0 rows — aborting`)
      }
      await tx.insert(assetEvents).values({
        id: createId(),
        assetId: unit.id,
        type: "correction",
        fromStatus: null,
        toStatus: null,
        notes: `Reverted the 2026-08-23 reallocation: origin restored to order ${group.orderNumber} (line ${group.orderLineId}). The device remains allocated to its current delivery request — origin must never be rewritten to lend a device out.`,
      })
      console.log(`reverted ${serial}`)
    }
  }
})

const after = await db
  .select({ serial: orderUnits.serialNumber, status: orderUnits.status, orderId: orderUnits.orderId, lineId: orderUnits.orderLineId, currentRequestId: orderUnits.currentRequestId })
  .from(orderUnits)
  .where(inArray(orderUnits.id, units.map((u) => u.id)))
console.table(after)
