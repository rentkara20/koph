import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "order-unit-availability-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("getAvailableOrderUnitsCore", () => {
  it("includes in-stock devices received through a purchase order linked to the customer order", async () => {
    const customerId = createId()
    const orderId = createId()
    const sourcingId = createId()
    const supplierId = createId()
    const caseId = createId()
    const poId = createId()
    const poLineId = createId()
    const assetId = createId()

    await db.insert(schema.customers).values({ id: customerId, name: "Customer" })
    await db.insert(schema.orders).values({ id: orderId, orderNumber: "10101", customerId })
    await db.insert(schema.sourcingRequests).values({
      id: sourcingId,
      sourceType: "customer_order",
      orderId,
      description: "Customer devices",
    })
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Supplier" })
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "commercial_flow",
      sourcingRequestId: sourcingId,
      supplierId,
    })
    await db.insert(schema.purchaseOrders).values({
      id: poId,
      supplierId,
      poNumber: "PO-10101",
      status: "received",
      procurementCaseId: caseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: poLineId,
      purchaseOrderId: poId,
      itemDescription: "Laptop",
      qtyOrdered: 1,
      qtyReceived: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: assetId,
      purchaseOrderLineId: poLineId,
      purchaseOrderId: poId,
      serialNumber: "SERIAL-10101",
      status: "in_stock",
    })

    const { getAvailableOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getAvailableOrderUnitsCore(tx, orderId))

    expect(units).toEqual([
      {
        unitId: assetId,
        serialNumber: "SERIAL-10101",
        description: "Laptop",
        brand: null,
        model: null,
        supplierName: "Supplier",
      },
    ])
  })
})

describe("getLinkedOrderForProcurementCaseCore", () => {
  it("returns the customer order that owns the sourcing chain", async () => {
    const customerId = createId()
    const orderId = createId()
    const sourcingId = createId()
    const caseId = createId()

    await db.insert(schema.customers).values({ id: customerId, name: "Context Customer" })
    await db.insert(schema.orders).values({ id: orderId, orderNumber: "20202", customerId })
    await db.insert(schema.sourcingRequests).values({
      id: sourcingId,
      sourceType: "customer_order",
      orderId,
      description: "Context devices",
    })
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "commercial_flow",
      sourcingRequestId: sourcingId,
    })

    const { getLinkedOrderForProcurementCaseCore } = await import("./procurement")
    const linkedOrder = await db.transaction((tx) =>
      getLinkedOrderForProcurementCaseCore(tx, caseId)
    )

    expect(linkedOrder).toEqual({ id: orderId, orderNumber: "20202" })
  })
})
