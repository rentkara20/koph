import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { applyAssetTransition } from "@/lib/actions/asset-transition"
import { servingOrder } from "@/lib/db/asset-allocation-sql"
import {
  AdoptionError,
  adoptUnitsIntoOrderLineCore,
  getAdoptableUnitsCore,
} from "@/lib/actions/order-unit-adoption-core"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

const IPAD = "Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "order-unit-adoption-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Builds an order with one rental line and returns both ids.
async function makeOrder(orderNumber: string, quantity = 10) {
  const customerId = createId()
  const orderId = createId()
  const lineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId })
  await db.insert(schema.orderLines).values({
    id: lineId,
    orderId,
    type: "rental_asset",
    description: IPAD,
    quantity,
  })
  return { orderId, lineId, customerId }
}

async function makeUnit(
  orderId: string | null,
  lineId: string | null,
  serial: string,
  status: schema.OrderUnit["status"] = "in_stock",
) {
  const id = createId()
  await db.insert(schema.orderUnits).values({
    id,
    orderId,
    orderLineId: lineId,
    serialNumber: serial,
    status,
    kind: "rental",
  })
  return id
}

// A device only counts as reusable free stock once it has actually come back
// from a customer — the "returned" event is that proof.
async function markReturned(assetId: string) {
  await db.insert(schema.assetEvents).values({
    id: createId(),
    assetId,
    type: "returned",
    fromStatus: "delivered",
    toStatus: "returned",
  })
}

describe("getAdoptableUnitsCore", () => {
  it("offers an in-stock device that came back from another order", async () => {
    const source = await makeOrder("20001")
    const target = await makeOrder("20002")
    const unitId = await makeUnit(source.orderId, source.lineId, "RETURNED001")
    await markReturned(unitId)

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    const row = rows.find((r) => r.unitId === unitId)
    expect(row).toBeDefined()
    expect(row!.description).toBe(IPAD)
    expect(row!.originOrderNumber).toBe("20001")
  })

  it("offers a standalone back-filled device with no origin at all", async () => {
    const target = await makeOrder("20003")
    const unitId = await makeUnit(null, null, "STANDALONE001")

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    expect(rows.map((r) => r.unitId)).toContain(unitId)
  })

  it("excludes a device still awaiting its first delivery for its own order", async () => {
    const source = await makeOrder("20004")
    const target = await makeOrder("20005")
    // in_stock but never delivered: committed to 20004, not free stock.
    const unitId = await makeUnit(source.orderId, source.lineId, "COMMITTED001")

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    expect(rows.map((r) => r.unitId)).not.toContain(unitId)
  })

  it("excludes devices this order already owns", async () => {
    const target = await makeOrder("20006")
    const unitId = await makeUnit(target.orderId, target.lineId, "OWNED001")
    await markReturned(unitId)

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    expect(rows.map((r) => r.unitId)).not.toContain(unitId)
  })

  it("excludes devices that are not physically free", async () => {
    const source = await makeOrder("20007")
    const target = await makeOrder("20008")
    const delivered = await makeUnit(source.orderId, source.lineId, "OUT001", "delivered")
    await markReturned(delivered)
    const damaged = await makeUnit(source.orderId, source.lineId, "DAMAGED001", "damaged")
    await markReturned(damaged)

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    expect(rows.map((r) => r.unitId)).not.toContain(delivered)
    expect(rows.map((r) => r.unitId)).not.toContain(damaged)
  })

  it("excludes a device still attached to a live request", async () => {
    const source = await makeOrder("20009")
    const target = await makeOrder("20010")
    const unitId = await makeUnit(source.orderId, source.lineId, "ONREQUEST001")
    await markReturned(unitId)
    await db
      .update(schema.orderUnits)
      .set({ currentRequestId: createId() })
      .where(eq(schema.orderUnits.id, unitId))

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    expect(rows.map((r) => r.unitId)).not.toContain(unitId)
  })

  it("excludes sale units — a sold product never re-enters the rental pool", async () => {
    const source = await makeOrder("20011")
    const target = await makeOrder("20012")
    const unitId = await makeUnit(source.orderId, source.lineId, "SALEUNIT001")
    await markReturned(unitId)
    await db.update(schema.orderUnits).set({ kind: "sale" }).where(eq(schema.orderUnits.id, unitId))

    const rows = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))

    expect(rows.map((r) => r.unitId)).not.toContain(unitId)
  })
})

describe("adoptUnitsIntoOrderLineCore", () => {
  it("repoints a returned device onto the target line and records a correction event", async () => {
    const source = await makeOrder("21001")
    const target = await makeOrder("21002")
    const unitId = await makeUnit(source.orderId, source.lineId, "ADOPT001")
    await markReturned(unitId)

    const result = await db.transaction((tx) =>
      adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [unitId]),
    )
    expect(result.adopted).toBe(1)

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, unitId))
    // The ORIGIN is untouched — order 21001 keeps its record of this device.
    expect(unit.orderId).toBe(source.orderId)
    expect(unit.orderLineId).toBe(source.lineId)
    // The ALLOCATION carries the lending.
    expect(unit.currentOrderId).toBe(target.orderId)
    expect(unit.currentOrderLineId).toBe(target.lineId)
    // Still physically in the warehouse — allocation is not shipping.
    expect(unit.status).toBe("in_stock")

    const events = await db
      .select()
      .from(schema.assetEvents)
      .where(eq(schema.assetEvents.assetId, unitId))
    const note = events.find((e) => e.notes?.includes("Allocated to order line"))
    expect(note).toBeDefined()
    expect(note!.notes).toContain(target.lineId)
  })

  it("never removes the device from the order it came from", async () => {
    const source = await makeOrder("21003")
    const target = await makeOrder("21004")
    const unitId = await makeUnit(source.orderId, source.lineId, "ADOPT002")
    await markReturned(unitId)

    await db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [unitId]))

    // No longer free stock — it is allocated.
    const stillOffered = await db.transaction((tx) => getAdoptableUnitsCore(tx, target.orderId))
    expect(stillOffered.map((r) => r.unitId)).not.toContain(unitId)

    // The source order's own record of the device is intact. This is the
    // regression the 2026-08-23 repoint caused and must never come back.
    const onSource = await db
      .select()
      .from(schema.orderUnits)
      .where(eq(schema.orderUnits.orderId, source.orderId))
    expect(onSource.map((u) => u.id)).toContain(unitId)
  })

  it("rejects a line that belongs to a different order", async () => {
    const source = await makeOrder("21005")
    const target = await makeOrder("21006")
    const other = await makeOrder("21007")
    const unitId = await makeUnit(source.orderId, source.lineId, "ADOPT003")
    await markReturned(unitId)

    await expect(
      db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, other.lineId, [unitId])),
    ).rejects.toThrow(AdoptionError)
  })

  it("rejects a sold_product line", async () => {
    const source = await makeOrder("21008")
    const target = await makeOrder("21009")
    await db
      .update(schema.orderLines)
      .set({ type: "sold_product" })
      .where(eq(schema.orderLines.id, target.lineId))
    const unitId = await makeUnit(source.orderId, source.lineId, "ADOPT004")
    await markReturned(unitId)

    await expect(
      db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [unitId])),
    ).rejects.toThrow(/rental lines/)
  })

  it("shows the borrowed device as serving the borrowing order, not the origin one", async () => {
    const source = await makeOrder("21020")
    const target = await makeOrder("21021")
    const unitId = await makeUnit(source.orderId, source.lineId, "ADOPT020")
    await markReturned(unitId)

    await db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [unitId]))

    const servingTarget = await db.select().from(schema.orderUnits).where(servingOrder(target.orderId))
    expect(servingTarget.map((u) => u.id)).toContain(unitId)

    const servingSource = await db.select().from(schema.orderUnits).where(servingOrder(source.orderId))
    expect(servingSource.map((u) => u.id)).not.toContain(unitId)
  })

  it("returns the device to free stock — and to its origin's view — when it comes back", async () => {
    const source = await makeOrder("21022")
    const target = await makeOrder("21023")
    const unitId = await makeUnit(source.orderId, source.lineId, "ADOPT021")
    await markReturned(unitId)
    await db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [unitId]))

    // Out to the customer and back again, through the one chokepoint. A
    // delivery request assigns first — allocation alone is not shipping.
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "assign", {
        orderId: target.orderId,
        orderLineId: target.lineId,
      })
      await applyAssetTransition(tx, unitId, "deliver")
      await applyAssetTransition(tx, unitId, "return")
      await applyAssetTransition(tx, unitId, "restock")
    })

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, unitId))
    // Allocation cleared by the chokepoint — no manual cleanup anywhere.
    expect(unit.currentOrderId).toBeNull()
    expect(unit.currentOrderLineId).toBeNull()
    expect(unit.status).toBe("in_stock")

    // Free for any order again, including a third one.
    const third = await makeOrder("21024")
    const offered = await db.transaction((tx) => getAdoptableUnitsCore(tx, third.orderId))
    expect(offered.map((r) => r.unitId)).toContain(unitId)

    // And with no allocation, it reads as its origin's device once more.
    const servingSource = await db.select().from(schema.orderUnits).where(servingOrder(source.orderId))
    expect(servingSource.map((u) => u.id)).toContain(unitId)
  })

  it("refuses to overfill the line beyond its quantity", async () => {
    const source = await makeOrder("21010")
    const target = await makeOrder("21011", 2)
    const ids: string[] = []
    for (const serial of ["ADOPT005", "ADOPT006", "ADOPT007"]) {
      const id = await makeUnit(source.orderId, source.lineId, serial)
      await markReturned(id)
      ids.push(id)
    }

    await expect(
      db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, ids)),
    ).rejects.toThrow(/capacity/)

    // Nothing partially applied.
    const allocated = await db
      .select()
      .from(schema.orderUnits)
      .where(eq(schema.orderUnits.currentOrderId, target.orderId))
    expect(allocated).toHaveLength(0)
  })

  it("refuses a device that is not adoptable, without moving the rest", async () => {
    const source = await makeOrder("21012")
    const target = await makeOrder("21013")
    const good = await makeUnit(source.orderId, source.lineId, "ADOPT008")
    await markReturned(good)
    // Committed stock: in_stock but never delivered for its own order.
    const committed = await makeUnit(source.orderId, source.lineId, "ADOPT009")

    await expect(
      db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [good, committed])),
    ).rejects.toThrow(/no longer available/)

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, good))
    expect(unit.currentOrderId).toBeNull()
  })

  it("lends a PO-origin device without touching its purchase-order link", async () => {
    const target = await makeOrder("21014")
    const supplierId = createId()
    const caseId = createId()
    const poId = createId()
    const poLineId = createId()
    const unitId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Supplier" })
    await db.insert(schema.procurementCases).values({ id: caseId, source: "system_manual", supplierId })
    await db
      .insert(schema.purchaseOrders)
      .values({ id: poId, poNumber: "PO-777", supplierId, procurementCaseId: caseId })
    await db.insert(schema.purchaseOrderLines).values({
      id: poLineId,
      purchaseOrderId: poId,
      itemDescription: IPAD,
      qtyOrdered: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: unitId,
      purchaseOrderLineId: poLineId,
      purchaseOrderId: poId,
      serialNumber: "ADOPT010",
      status: "in_stock",
      kind: "rental",
    })
    await markReturned(unitId)

    await db.transaction((tx) => adoptUnitsIntoOrderLineCore(tx, target.orderId, target.lineId, [unitId]))

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, unitId))
    expect(unit.currentOrderLineId).toBe(target.lineId)
    // Procurement traceability survives untouched — the old repoint had to null
    // this to satisfy the single-origin constraint.
    expect(unit.purchaseOrderLineId).toBe(poLineId)
    expect(unit.purchaseOrderId).toBe(poId)
  })
})
