import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { eq } from "drizzle-orm"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

// The inbound half of the order-unit lookup: what a collection request may
// pull back from a customer. Mirror of order-unit-availability.integration.test
// (which covers the outbound half).

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "collection-units-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedOrder(orderNumber: string) {
  const customerId = createId()
  const orderId = createId()
  const orderLineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId })
  await db.insert(schema.orderLines).values({
    id: orderLineId,
    orderId,
    description: "Laptop",
    quantity: 1,
  })
  return { customerId, orderId, orderLineId }
}

describe("getDeliveredOrderUnitsCore", () => {
  it("returns delivered units minted against the order and ignores ones still in stock", async () => {
    const { orderId, orderLineId } = await seedOrder("50501")
    const deliveredId = createId()
    const inStockId = createId()

    await db.insert(schema.orderUnits).values([
      {
        id: deliveredId,
        orderId,
        orderLineId,
        serialNumber: "SN-OUT-1",
        status: "delivered",
      },
      {
        id: inStockId,
        orderId,
        orderLineId,
        serialNumber: "SN-IN-1",
        status: "in_stock",
      },
    ])

    const { getDeliveredOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getDeliveredOrderUnitsCore(tx, orderId, "50501"))

    expect(units).toEqual([
      {
        unitId: deliveredId,
        serialNumber: "SN-OUT-1",
        description: "Laptop",
        brand: null,
        model: null,
        supplierName: null,
      },
    ])
  })

  it("finds a free-stock unit delivered under this order via its delivery request", async () => {
    const { customerId, orderId } = await seedOrder("50502")

    // Free stock: a manual PO with no sourcing chain, so the unit carries no
    // order_id of its own. The only link to the order is the request it went
    // out on, which points back by quote number.
    const supplierId = createId()
    const caseId = createId()
    const poId = createId()
    const poLineId = createId()
    const freeUnitId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Manual Supplier" })
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "system_manual",
      supplierId,
    })
    await db.insert(schema.purchaseOrders).values({
      id: poId,
      supplierId,
      poNumber: "PO-FREE-50502",
      status: "received",
      procurementCaseId: caseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: poLineId,
      purchaseOrderId: poId,
      itemDescription: "Free Laptop",
      qtyOrdered: 1,
      qtyReceived: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: freeUnitId,
      purchaseOrderLineId: poLineId,
      purchaseOrderId: poId,
      supplierId,
      serialNumber: "SN-FREE-OUT",
      status: "delivered",
    })

    const [deliveryType] = await db
      .insert(schema.requestTypes)
      .values({ id: createId(), slug: "delivery-50502", nameEn: "Delivery", nameAr: "تسليم" })
      .returning()
    const requestId = createId()
    await db.insert(schema.requests).values({
      id: requestId,
      requestNumber: "REQ-50502",
      trackingCode: "TRK-50502",
      typeId: deliveryType.id,
      customerId,
      quoteNumber: "50502",
      status: "completed",
    })
    await db.insert(schema.requestItems).values({
      id: createId(),
      requestId,
      description: "Free Laptop",
      quantity: 1,
      orderUnitId: freeUnitId,
    })

    const { getDeliveredOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getDeliveredOrderUnitsCore(tx, orderId, "50502"))

    expect(units.map((u) => u.serialNumber)).toEqual(["SN-FREE-OUT"])
    expect(units[0].description).toBe("Free Laptop")
  })

  it("never offers a delivered unit that went out under a different order", async () => {
    const { orderId } = await seedOrder("50503")
    const other = await seedOrder("50504")

    await db.insert(schema.orderUnits).values({
      id: createId(),
      orderId: other.orderId,
      orderLineId: other.orderLineId,
      serialNumber: "SN-OTHER-OUT",
      status: "delivered",
    })

    const { getDeliveredOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getDeliveredOrderUnitsCore(tx, orderId, "50503"))

    expect(units).toEqual([])
  })

  it("prefers the per-asset name override over the origin line description", async () => {
    const { orderId, orderLineId } = await seedOrder("50505")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: "SN-RENAMED",
      model: "Dell Latitude 5540",
      status: "delivered",
    })

    const { getDeliveredOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getDeliveredOrderUnitsCore(tx, orderId, "50505"))

    expect(units[0].description).toBe("Dell Latitude 5540")
  })
  it("finds a PO-origin unit whose procurement chain resolves to this order, even with order_id unset", async () => {
    // Regression: order_id is only stamped on a unit once something allocates
    // it, so a device purchased through the order's own sourcing chain can be
    // out with the customer while order_unit.order_id is still null. The
    // outbound lookup already resolved that chain; inbound did not, so the
    // collection form reported "0 out with customer" for an order whose
    // workspace was listing the devices.
    const { orderId } = await seedOrder("50506")

    const supplierId = createId()
    const sourcingId = createId()
    const caseId = createId()
    const poId = createId()
    const poLineId = createId()
    const unitId = createId()

    await db.insert(schema.suppliers).values({ id: supplierId, name: "Chain Supplier" })
    await db.insert(schema.sourcingRequests).values({
      id: sourcingId,
      sourceType: "customer_order",
      description: "Chain Laptop",
      orderId,
      status: "handed_off",
    })
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "commercial_flow",
      sourcingRequestId: sourcingId,
      supplierId,
    })
    await db.insert(schema.purchaseOrders).values({
      id: poId,
      supplierId,
      poNumber: "PO-CHAIN-50506",
      status: "received",
      procurementCaseId: caseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: poLineId,
      purchaseOrderId: poId,
      itemDescription: "Chain Laptop",
      qtyOrdered: 1,
      qtyReceived: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: unitId,
      purchaseOrderLineId: poLineId,
      purchaseOrderId: poId,
      supplierId,
      serialNumber: "SN-CHAIN-OUT",
      status: "delivered",
      // orderId deliberately left unset — that is the whole point.
    })

    const { getDeliveredOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getDeliveredOrderUnitsCore(tx, orderId, "50506"))

    expect(units.map((u) => u.serialNumber)).toEqual(["SN-CHAIN-OUT"])
    expect(units[0].description).toBe("Chain Laptop")
  })

  it("still excludes a PO-origin delivered unit whose chain resolves to another order", async () => {
    const { orderId } = await seedOrder("50507")
    const other = await seedOrder("50508")

    const supplierId = createId()
    const sourcingId = createId()
    const caseId = createId()
    const poId = createId()
    const poLineId = createId()

    await db.insert(schema.suppliers).values({ id: supplierId, name: "Other Chain Supplier" })
    await db.insert(schema.sourcingRequests).values({
      id: sourcingId,
      sourceType: "customer_order",
      description: "Other Chain Laptop",
      orderId: other.orderId,
      status: "handed_off",
    })
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "commercial_flow",
      sourcingRequestId: sourcingId,
      supplierId,
    })
    await db.insert(schema.purchaseOrders).values({
      id: poId,
      supplierId,
      poNumber: "PO-CHAIN-50508",
      status: "received",
      procurementCaseId: caseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: poLineId,
      purchaseOrderId: poId,
      itemDescription: "Other Chain Laptop",
      qtyOrdered: 1,
      qtyReceived: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: createId(),
      purchaseOrderLineId: poLineId,
      purchaseOrderId: poId,
      supplierId,
      serialNumber: "SN-CHAIN-OTHER",
      status: "delivered",
    })

    const { getDeliveredOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getDeliveredOrderUnitsCore(tx, orderId, "50507"))

    expect(units).toEqual([])
  })
})

// request_type.slug is unique, so tests in this file share one "delivery" row
// rather than each inserting their own.
async function deliveryTypeId() {
  const existing = await db
    .select({ id: schema.requestTypes.id })
    .from(schema.requestTypes)
    .where(eq(schema.requestTypes.slug, "delivery"))
  if (existing[0]) return existing[0].id
  const [created] = await db
    .insert(schema.requestTypes)
    .values({ id: createId(), slug: "delivery", nameEn: "Delivery", nameAr: "توصيل" })
    .returning()
  return created.id
}

describe("getOriginDeliveryDateCore", () => {
  it("returns the newest completed handover date for the order", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Origin Date Customer" })
    const deliveryTypeIdValue = await deliveryTypeId()

    const older = Date.UTC(2026, 0, 10)
    const newer = Date.UTC(2026, 2, 5)

    await db.insert(schema.requests).values([
      {
        id: createId(),
        requestNumber: "REQ-OD-1",
        trackingCode: "TRK-OD-1",
        typeId: deliveryTypeIdValue,
        customerId,
        quoteNumber: "60601",
        status: "completed",
        deliveryDate: older,
      },
      {
        id: createId(),
        requestNumber: "REQ-OD-2",
        trackingCode: "TRK-OD-2",
        typeId: deliveryTypeIdValue,
        customerId,
        quoteNumber: "60601",
        status: "completed",
        deliveryDate: newer,
      },
    ])

    const { getOriginDeliveryDateCore } = await import("./orders")
    const date = await db.transaction((tx) => getOriginDeliveryDateCore(tx, "60601"))

    // Newest handover wins — a re-delivery or swap is the current truth.
    expect(date).toBe(newer)
  })

  it("ignores requests belonging to another order and returns null when there is nothing to go on", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Other Order Customer" })
    const [deliveryType] = await db
      .insert(schema.requestTypes)
      .values({ id: createId(), slug: "delivery-60603", nameEn: "Delivery", nameAr: "توصيل" })
      .returning()
    await db.insert(schema.requests).values({
      id: createId(),
      requestNumber: "REQ-OD-3",
      trackingCode: "TRK-OD-3",
      typeId: deliveryType.id,
      customerId,
      quoteNumber: "60603",
      status: "completed",
      deliveryDate: Date.UTC(2026, 3, 1),
    })

    const { getOriginDeliveryDateCore } = await import("./orders")
    expect(await db.transaction((tx) => getOriginDeliveryDateCore(tx, "60602"))).toBeNull()
  })

  it("skips a collection request — its own date is not a handover date", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Collection Only Customer" })
    const [collectionType] = await db
      .insert(schema.requestTypes)
      .values({ id: createId(), slug: "collection", nameEn: "Collection", nameAr: "استلام" })
      .returning()
    await db.insert(schema.requests).values({
      id: createId(),
      requestNumber: "REQ-OD-4",
      trackingCode: "TRK-OD-4",
      typeId: collectionType.id,
      customerId,
      quoteNumber: "60604",
      status: "completed",
      deliveryDate: Date.UTC(2026, 4, 4),
    })

    const { getOriginDeliveryDateCore } = await import("./orders")
    expect(await db.transaction((tx) => getOriginDeliveryDateCore(tx, "60604"))).toBeNull()
  })
  it("prefers a completed delivery over a later draft — a plan is not a handover", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Draft vs Done Customer" })
    const deliveryTypeIdValue = await deliveryTypeId()

    const doneOn = Date.UTC(2026, 1, 1)
    const plannedFor = Date.UTC(2026, 5, 1) // later, but never executed

    await db.insert(schema.requests).values([
      {
        id: createId(),
        requestNumber: "REQ-OD-5",
        trackingCode: "TRK-OD-5",
        typeId: deliveryTypeIdValue,
        customerId,
        quoteNumber: "60605",
        status: "completed",
        deliveryDate: doneOn,
      },
      {
        id: createId(),
        requestNumber: "REQ-OD-6",
        trackingCode: "TRK-OD-6",
        typeId: deliveryTypeIdValue,
        customerId,
        quoteNumber: "60605",
        status: "draft",
        deliveryDate: plannedFor,
      },
    ])

    const { getOriginDeliveryDateCore } = await import("./orders")
    expect(await db.transaction((tx) => getOriginDeliveryDateCore(tx, "60605"))).toBe(doneOn)
  })

  it("never reports a cancelled or failed delivery as the handover date", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Cancelled Customer" })
    const deliveryTypeIdValue = await deliveryTypeId()

    await db.insert(schema.requests).values([
      {
        id: createId(),
        requestNumber: "REQ-OD-7",
        trackingCode: "TRK-OD-7",
        typeId: deliveryTypeIdValue,
        customerId,
        quoteNumber: "60606",
        status: "cancelled",
        deliveryDate: Date.UTC(2026, 6, 1),
      },
      {
        id: createId(),
        requestNumber: "REQ-OD-8",
        trackingCode: "TRK-OD-8",
        typeId: deliveryTypeIdValue,
        customerId,
        quoteNumber: "60606",
        status: "failed",
        deliveryDate: Date.UTC(2026, 6, 2),
      },
    ])

    const { getOriginDeliveryDateCore } = await import("./orders")
    expect(await db.transaction((tx) => getOriginDeliveryDateCore(tx, "60606"))).toBeNull()
  })
})
