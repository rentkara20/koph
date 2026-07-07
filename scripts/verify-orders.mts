/**
 * Standalone verification — builds a LOCAL sqlite file DB (never touches prod),
 * applies all migrations, then exercises the real Orders → Request import logic
 * using the same drizzle queries the server actions run.
 *
 * Run: npx tsx scripts/verify-orders.mts
 */
import { readFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { and, eq, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import {
  customers,
  orderLines,
  orderUnits,
  orders,
  requestItems,
  requests,
  requestTypes,
  suppliers,
} from "../lib/db/schema"
import { deriveOrderStatus } from "../lib/utils/order-status"

const DB_PATH = "./local-test.db"
rmSync(DB_PATH, { force: true })

const client = createClient({ url: `file:${DB_PATH}` })
const db = drizzle(client, { schema: { orders, orderLines, orderUnits } })

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg)
  console.log("  ✓ " + msg)
}

async function applyMigrations() {
  const dir = "lib/db/migrations"
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8")
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim()
      if (trimmed) await client.execute(trimmed)
    }
  }
  console.log(`Applied ${files.length} migration files → ${DB_PATH}`)
}

async function main() {
  await applyMigrations()

  console.log("\nSeed:")
  const typeId = createId()
  await db.insert(requestTypes).values({ id: typeId, slug: "delivery", nameEn: "Delivery", nameAr: "توصيل", sortOrder: 1 })
  const customerId = createId()
  await db.insert(customers).values({ id: customerId, name: "LeanNode" })
  const supplierId = createId()
  await db.insert(suppliers).values({ id: supplierId, name: "Jarir" })
  console.log("  seeded type, customer, supplier")

  // createOrder-equivalent
  console.log("\nCreate order 10669 + line + 3 units:")
  const orderId = createId()
  await db.insert(orders).values({
    id: orderId,
    orderNumber: "10669",
    customerId,
    total: 3987,
    status: "confirmed",
  })
  const lineId = createId()
  await db.insert(orderLines).values({
    id: lineId,
    orderId,
    description: "ThinkPad L14, U7-255U, 32GB, 512GB, Win 11 Pro",
    brand: "Lenovo",
    quantity: 3,
    rentalMonths: 3,
    unitPriceMonthly: 1329,
    lineTotal: 3987,
  })
  const unitIds = [createId(), createId(), createId()]
  await db.insert(orderUnits).values(
    unitIds.map((id, i) => ({
      id,
      orderId,
      orderLineId: lineId,
      serialNumber: `PF4X000${i + 1}`,
      supplierId,
      purchaseCost: 3500,
      status: "in_stock" as const,
    }))
  )
  console.log("  order + line + 3 in_stock units inserted")

  // getOrderUnitsByNumber-equivalent (the real join in lib/actions/orders.ts)
  console.log("\nLookup available units by order number '10669':")
  const [ord] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, customerId: orders.customerId, customerName: customers.name })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.orderNumber, "10669"), isNull(orders.deletedAt)))
  assert(!!ord, "order found by number")
  assert(ord.customerName === "LeanNode", "customer name joined")

  const available = await db
    .select({
      unitId: orderUnits.id,
      serialNumber: orderUnits.serialNumber,
      description: orderLines.description,
      supplierName: suppliers.name,
    })
    .from(orderUnits)
    .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(suppliers, eq(orderUnits.supplierId, suppliers.id))
    .where(and(eq(orderUnits.orderId, ord.id), eq(orderUnits.status, "in_stock")))
  assert(available.length === 3, "3 units available (in_stock)")
  assert(available[0].supplierName === "Jarir", "supplier name joined onto unit")
  assert(available[0].description.includes("ThinkPad"), "line description joined onto unit")

  // createRequest-equivalent: pull 2 units into a request, flip them to assigned
  console.log("\nImport 2 units into a new request:")
  const reqId = createId()
  await db.insert(requests).values({
    id: reqId,
    requestNumber: "KR-2026-00001",
    trackingCode: "ABC234",
    typeId,
    customerId,
    quoteNumber: "10669",
    status: "draft",
  })
  const pulled = available.slice(0, 2)
  await db.insert(requestItems).values(
    pulled.map((u) => ({
      id: createId(),
      requestId: reqId,
      description: u.description,
      serialNumber: u.serialNumber,
      quantity: 1,
      orderUnitId: u.unitId,
    }))
  )
  const { inArray } = await import("drizzle-orm")
  await db.update(orderUnits).set({ status: "assigned" }).where(inArray(orderUnits.id, pulled.map((u) => u.unitId)))
  console.log("  2 request_items created w/ orderUnitId, units flipped to assigned")

  // Verify: request_item FK stored + units no longer available
  const items = await db.select().from(requestItems).where(eq(requestItems.requestId, reqId))
  assert(items.length === 2, "2 request items stored")
  assert(items.every((i) => !!i.orderUnitId), "each item carries orderUnitId (traceability)")

  const stillAvailable = await db
    .select({ unitId: orderUnits.id })
    .from(orderUnits)
    .where(and(eq(orderUnits.orderId, ord.id), eq(orderUnits.status, "in_stock")))
  assert(stillAvailable.length === 1, "only 1 unit left in_stock (2 pulled, not double-bookable)")

  // App-level integrity (runtime runs with FK enforcement OFF, like the rest of
  // KOPH). updateOrder must refuse to drop a line whose devices are committed.
  console.log("\nApp-level line-removal guard (updateOrder logic):")
  const { ne } = await import("drizzle-orm")
  const committed = await db
    .select({ id: orderUnits.id })
    .from(orderUnits)
    .where(and(eq(orderUnits.orderLineId, lineId), ne(orderUnits.status, "in_stock")))
  assert(committed.length === 2, "line has 2 committed (assigned) units → removal is blocked")

  // A line with only in_stock units removes cleanly (units deleted explicitly, no dangling refs).
  const line2 = createId()
  await db.insert(orderLines).values({ id: line2, orderId, description: "Spare mouse", quantity: 1 })
  const spareUnit = createId()
  await db.insert(orderUnits).values({ id: spareUnit, orderId, orderLineId: line2, status: "in_stock" })
  await db.delete(orderUnits).where(eq(orderUnits.orderLineId, line2))
  await db.delete(orderLines).where(eq(orderLines.id, line2))
  const gone = await db.select().from(orderLines).where(eq(orderLines.id, line2))
  assert(gone.length === 0, "in_stock-only line removed cleanly with its units")
  const itemsIntact = await db.select().from(requestItems).where(eq(requestItems.requestId, reqId))
  assert(itemsIntact.length === 2 && itemsIntact.every((i) => !!i.orderUnitId), "committed request items + their orderUnitId untouched")

  // deriveOrderStatus: the new auto-status logic that replaced the manual select.
  console.log("\nderiveOrderStatus (order-status.ts):")
  assert(deriveOrderStatus([], "draft") === "draft", "no units → draft")
  assert(deriveOrderStatus(["in_stock", "in_stock"], "draft") === "confirmed", "all in_stock → confirmed")
  assert(deriveOrderStatus(["in_stock", "assigned"], "confirmed") === "partially_fulfilled", "mixed → partially_fulfilled")
  assert(deriveOrderStatus(["assigned", "delivered"], "confirmed") === "fulfilled", "none in_stock → fulfilled")
  assert(deriveOrderStatus(["in_stock"], "cancelled") === "cancelled", "cancelled is sticky regardless of units")

  // getRequestsForOrder-equivalent: reverse traceability join + per-request item count.
  console.log("\nReverse traceability (getRequestsForOrder logic):")
  const linkRows = await db
    .select({
      requestId: requests.id,
      requestNumber: requests.requestNumber,
      status: requests.status,
      typeName: requestTypes.nameEn,
    })
    .from(requestItems)
    .innerJoin(orderUnits, eq(requestItems.orderUnitId, orderUnits.id))
    .innerJoin(requests, eq(requestItems.requestId, requests.id))
    .leftJoin(requestTypes, eq(requests.typeId, requestTypes.id))
    .where(and(eq(orderUnits.orderId, orderId), isNull(requests.deletedAt)))

  const byId = new Map()
  for (const r of linkRows) {
    const existing = byId.get(r.requestId)
    if (existing) existing.itemCount += 1
    else byId.set(r.requestId, { ...r, itemCount: 1 })
  }
  const linked = [...byId.values()]
  assert(linked.length === 1, "exactly 1 distinct request linked to this order")
  assert(linked[0].itemCount === 2, "linked request shows 2 items pulled from this order (not 1 row per join match)")
  assert(linked[0].typeName === "Delivery", "request type name joined correctly")

  console.log("\n✅ ALL CHECKS PASSED")
  rmSync(DB_PATH, { force: true })
}

main().catch((e) => {
  console.error("\n❌", e.message)
  rmSync(DB_PATH, { force: true })
  process.exit(1)
})
