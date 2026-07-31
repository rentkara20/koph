import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
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
})
