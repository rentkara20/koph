/**
 * Backfill order_unit.current_order_id / current_order_line_id (migration 0045).
 *
 * Before those columns existed, "which order is this device serving" was read
 * off order_unit.order_id — the device's ORIGIN. That conflation is why a
 * returned device stayed invisible to every other order, and why two repoint
 * scripts rewrote origins and erased the originating orders' records.
 *
 * For every device currently out (assigned/delivered) this fills the allocation
 * from the best available evidence, in order:
 *   1. its live request's order (request.quote_number -> order.order_number) —
 *      the request is what actually put the device where it is, so it is the
 *      truth even when the origin says otherwise;
 *   2. its origin order/line — correct for the overwhelming majority, which
 *      never left the order they were bought for.
 *
 * Devices in the warehouse are left with a NULL allocation, which is exactly
 * what "free stock" now means.
 *
 * Nothing is deleted and no origin is touched.
 *
 * Run: npx tsx scripts/backfill-current-allocation.mts [--prod] [--apply]
 */
import { config } from "dotenv"

const APPLY = process.argv.includes("--apply")
const PROD = process.argv.includes("--prod")
config({ path: PROD ? ".env.production.backup" : ".env.local", quiet: true })

const { db } = await import("../lib/db")
const { orderUnits, orders, orderLines, purchaseOrderLines, requests } = await import("../lib/db/schema")
const { eq, inArray, sql } = await import("drizzle-orm")
const { matchAllocationLine } = await import("../lib/domain/asset-allocation")

const out = await db
  .select({
    id: orderUnits.id,
    serialNumber: orderUnits.serialNumber,
    status: orderUnits.status,
    kind: orderUnits.kind,
    originOrderId: orderUnits.orderId,
    originOrderLineId: orderUnits.orderLineId,
    originPurchaseOrderLineId: orderUnits.purchaseOrderLineId,
    // Per-asset rename wins over any origin line, exactly as the asset screens
    // resolve a device's display name.
    ownModel: orderUnits.model,
    currentOrderId: orderUnits.currentOrderId,
    currentRequestId: orderUnits.currentRequestId,
  })
  .from(orderUnits)
  .where(inArray(orderUnits.status, ["assigned", "delivered"]))

console.log(`${out.length} device(s) currently out with customers`)

// The order each live request belongs to, by request id.
const requestIds = [...new Set(out.map((u) => u.currentRequestId).filter((v): v is string => Boolean(v)))]
const requestRows = requestIds.length
  ? await db
      .select({ id: requests.id, quoteNumber: requests.quoteNumber })
      .from(requests)
      .where(inArray(requests.id, requestIds))
  : []
const quoteByRequestId = new Map(requestRows.map((r) => [r.id, r.quoteNumber]))

const quoteNumbers = [...new Set([...quoteByRequestId.values()].filter((v): v is string => Boolean(v)))]
const orderRows = quoteNumbers.length
  ? await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(inArray(orders.orderNumber, quoteNumbers))
  : []
const orderIdByNumber = new Map(orderRows.map((o) => [o.orderNumber, o.id]))

// Lines of every order we might allocate to, for line-level matching.
const candidateOrderIds = [
  ...new Set([...orderIdByNumber.values(), ...out.map((u) => u.originOrderId).filter((v): v is string => Boolean(v))]),
]
const lineRows = candidateOrderIds.length
  ? await db
      .select({ id: orderLines.id, orderId: orderLines.orderId, description: orderLines.description, type: orderLines.type })
      .from(orderLines)
      .where(inArray(orderLines.orderId, candidateOrderIds))
  : []
const linesByOrderId = new Map<string, typeof lineRows>()
for (const l of lineRows) {
  const list = linesByOrderId.get(l.orderId) ?? []
  list.push(l)
  linesByOrderId.set(l.orderId, list)
}
const lineById = new Map(lineRows.map((l) => [l.id, l]))

// Most devices out with customers came in through a purchase order, so their
// name lives on the PO line, not on a client order line. Without this the line
// match had nothing to compare and every one of them fell back to order level.
const poLineIds = [...new Set(out.map((u) => u.originPurchaseOrderLineId).filter((v): v is string => Boolean(v)))]
const poLineRows = poLineIds.length
  ? await db
      .select({ id: purchaseOrderLines.id, itemDescription: purchaseOrderLines.itemDescription })
      .from(purchaseOrderLines)
      .where(inArray(purchaseOrderLines.id, poLineIds))
  : []
const poDescriptionById = new Map(poLineRows.map((l) => [l.id, l.itemDescription]))

// The device's own name, from whichever origin it has.
function deviceName(u: (typeof out)[number]): string | null {
  const own = u.ownModel?.trim()
  if (own) return own
  if (u.originOrderLineId) return lineById.get(u.originOrderLineId)?.description ?? null
  if (u.originPurchaseOrderLineId) return poDescriptionById.get(u.originPurchaseOrderLineId) ?? null
  return null
}

type Plan = { id: string; serial: string; orderId: string | null; lineId: string | null; via: string }
const plans: Plan[] = []

for (const u of out) {
  const serial = (u.serialNumber ?? "—").trim()
  const quote = u.currentRequestId ? quoteByRequestId.get(u.currentRequestId) : null
  const requestOrderId = quote ? (orderIdByNumber.get(quote) ?? null) : null

  if (requestOrderId) {
    // The line the device serves on THAT order, matched on the device's own
    // name. No match is a valid outcome — substituting a different-but-equivalent
    // device is normal business, so the allocation is simply recorded at order
    // level rather than pinned to a line it may not belong to.
    const lineId = matchAllocationLine(
      deviceName(u),
      linesByOrderId.get(requestOrderId) ?? [],
      (u.kind ?? "rental") as "rental" | "sale",
    )
    plans.push({ id: u.id, serial, orderId: requestOrderId, lineId, via: `request order ${quote}` })
    continue
  }

  if (u.originOrderId) {
    plans.push({ id: u.id, serial, orderId: u.originOrderId, lineId: u.originOrderLineId, via: "origin" })
    continue
  }

  plans.push({ id: u.id, serial, orderId: null, lineId: null, via: "NO EVIDENCE — left null" })
}

const viaCounts = plans.reduce<Record<string, number>>((acc, p) => {
  const key = p.via.startsWith("request order") ? "from live request" : p.via
  acc[key] = (acc[key] ?? 0) + 1
  return acc
}, {})
console.log("evidence used:", viaCounts)

const changingOrder = plans.filter((p) => {
  const unit = out.find((u) => u.id === p.id)!
  return p.orderId && p.orderId !== unit.originOrderId
})
if (changingOrder.length) {
  console.log(`\n${changingOrder.length} device(s) allocated to an order OTHER than their origin (the case the old model could not express):`)
  for (const p of changingOrder) console.log(`  ${p.serial.padEnd(12)} -> ${p.via}${p.lineId ? "" : " (order level only, no line match)"}`)
}

const unresolved = plans.filter((p) => !p.orderId)
if (unresolved.length) {
  console.log(`\n${unresolved.length} device(s) with no order evidence — left NULL, will show under no order:`)
  for (const p of unresolved) console.log(`  ${p.serial}`)
}

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write")
  process.exit(0)
}

await db.transaction(async (tx) => {
  for (const p of plans) {
    if (!p.orderId) continue
    await tx
      .update(orderUnits)
      .set({ currentOrderId: p.orderId, currentOrderLineId: p.lineId, updatedAt: Date.now() })
      .where(eq(orderUnits.id, p.id))
  }
})

const [{ n }] = await db
  .select({ n: sql<number>`count(*)` })
  .from(orderUnits)
  .where(sql`${orderUnits.status} in ('assigned','delivered') and ${orderUnits.currentOrderId} is null`)
console.log(`\ndone. devices still out with no allocation: ${n}`)
