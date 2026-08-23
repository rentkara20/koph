/**
 * One-off prod correction (2026-08-19). Order 10716's six manually-entered
 * rental units came back to the warehouse but stayed at status "returned" AND
 * kept order_id = 10716, so no other order's picker could ever see them
 * (getAvailableOrderUnitsCore only offers this order's own units, PO-chain
 * units, or free stock — and free stock requires a purchase_order_line_id,
 * which manual units do not have).
 *
 * This script:
 *   1. restocks every "returned" unit through the OI-1 chokepoint, so the
 *      asset_event + domain event are written exactly as the UI would;
 *   2. repoints the four units order 10746 needs onto 10746's matching lines,
 *      recording a "correction" asset_event for the reallocation.
 *
 * Units are NOT detached from a line (brand/model are null on these rows, so a
 * line-less unit would render with a blank name). The general fix — freeing a
 * returned unit from its order — is the follow-up code change.
 *
 * Run: DOTENV=.env.production.backup npx tsx scripts/fix-10716-restock-repoint.mts [--apply]
 */
import { config } from "dotenv"
config({ path: ".env.production.backup" })

const { db } = await import("../lib/db")
const { orderUnits, assetEvents, orders, orderLines } = await import("../lib/db/schema")
const { applyAssetTransition } = await import("../lib/actions/asset-transition")
const { eq, and, inArray } = await import("drizzle-orm")
const { createId } = await import("../lib/utils/ids")

const APPLY = process.argv.includes("--apply")
const SOURCE_ORDER = "10716"
const TARGET_ORDER = "10746"

// serial -> target line description keyword; explicit per-serial so the
// reallocation is auditable rather than inferred at runtime.
const REPOINT: Record<string, "ipad_pro_256" | "ipad_10th_64"> = {
  KCWRYYPGFX: "ipad_pro_256",
  L20DN4C3YM: "ipad_pro_256",
  FC36T6Q093: "ipad_pro_256",
  HM96KKH7NW: "ipad_10th_64",
}
const TARGET_LINE_ID: Record<string, string> = {
  ipad_pro_256: "v364fkyw4ch0gpfwbdaog3zc",
  ipad_10th_64: "n68maeje31knjwitm9e07dmw",
}

const [source] = await db.select().from(orders).where(eq(orders.orderNumber, SOURCE_ORDER))
const [target] = await db.select().from(orders).where(eq(orders.orderNumber, TARGET_ORDER))
if (!source || !target) throw new Error("order not found")

const targetLines = await db.select().from(orderLines).where(eq(orderLines.orderId, target.id))
for (const lineId of Object.values(TARGET_LINE_ID)) {
  const line = targetLines.find((l) => l.id === lineId)
  if (!line) throw new Error(`target line ${lineId} not on order ${TARGET_ORDER}`)
  if (line.type !== "rental_asset") throw new Error(`target line ${lineId} is ${line.type}, expected rental_asset`)
}

const units = await db.select().from(orderUnits).where(eq(orderUnits.orderId, source.id))
console.log(`${units.length} units on ${SOURCE_ORDER}`)

for (const unit of units) {
  const serial = (unit.serialNumber ?? "").trim()
  const target = REPOINT[serial]
  console.log(
    `  ${serial.padEnd(12)} ${unit.status.padEnd(9)} -> restock${target ? ` + repoint(${target})` : ""}`
  )
}
if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write")
  process.exit(0)
}

await db.transaction(async (tx) => {
  for (const unit of units) {
    const serial = (unit.serialNumber ?? "").trim()
    if (unit.status === "returned") {
      await applyAssetTransition(tx, unit.id, "restock", {
        notes: `Warehouse restock after order ${SOURCE_ORDER} collection (bulk correction 2026-08-19)`,
      })
      console.log(`restocked ${serial}`)
    }

    const bucket = REPOINT[serial]
    if (!bucket) continue
    const lineId = TARGET_LINE_ID[bucket]
    const res = await tx
      .update(orderUnits)
      .set({ orderId: target.id, orderLineId: lineId, kind: "rental", updatedAt: Date.now() })
      .where(and(eq(orderUnits.id, unit.id), eq(orderUnits.orderId, source.id)))
    if (((res as { rowsAffected?: number }).rowsAffected ?? 1) === 0) {
      throw new Error(`repoint of ${serial} affected 0 rows — aborting`)
    }
    await tx.insert(assetEvents).values({
      id: createId(),
      assetId: unit.id,
      type: "correction",
      fromStatus: null,
      toStatus: null,
      notes: `Reallocated from order ${SOURCE_ORDER} to order ${TARGET_ORDER} (line ${lineId}) — free-stock reuse correction 2026-08-19`,
    })
    console.log(`repointed ${serial} -> ${TARGET_ORDER}/${lineId}`)
  }
})

const after = await db
  .select({ id: orderUnits.id, serial: orderUnits.serialNumber, status: orderUnits.status, orderId: orderUnits.orderId, lineId: orderUnits.orderLineId })
  .from(orderUnits)
  .where(inArray(orderUnits.id, units.map((u) => u.id)))
console.table(after.map((u) => ({ ...u, order: u.orderId === target.id ? TARGET_ORDER : SOURCE_ORDER })))
