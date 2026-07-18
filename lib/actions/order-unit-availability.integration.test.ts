import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
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
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
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

  it("includes free stock from manual POs (no sourcing chain) but excludes units allocated to another order", async () => {
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Manual Supplier" })

    // Free stock: manual PO → case has no sourcingRequestId.
    const manualCaseId = createId()
    const manualPoId = createId()
    const manualPoLineId = createId()
    const freeUnitId = createId()
    await db.insert(schema.procurementCases).values({ id: manualCaseId, source: "system_manual", supplierId })
    await db.insert(schema.purchaseOrders).values({
      id: manualPoId, supplierId, poNumber: "PO-MANUAL-1", status: "received", procurementCaseId: manualCaseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: manualPoLineId, purchaseOrderId: manualPoId, itemDescription: "Free Laptop", qtyOrdered: 1, qtyReceived: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: freeUnitId, purchaseOrderLineId: manualPoLineId, purchaseOrderId: manualPoId,
      serialNumber: "SERIAL-FREE-1", status: "in_stock",
    })

    // Allocated stock: chain resolves to a DIFFERENT order — must not leak.
    const otherCustomerId = createId()
    const otherOrderId = createId()
    const otherSourcingId = createId()
    const otherCaseId = createId()
    const otherPoId = createId()
    const otherPoLineId = createId()
    await db.insert(schema.customers).values({ id: otherCustomerId, name: "Other Customer" })
    await db.insert(schema.orders).values({ id: otherOrderId, orderNumber: "30303", customerId: otherCustomerId })
    await db.insert(schema.sourcingRequests).values({
      id: otherSourcingId, sourceType: "customer_order", orderId: otherOrderId, description: "Other devices",
    })
    await db.insert(schema.procurementCases).values({
      id: otherCaseId, source: "commercial_flow", sourcingRequestId: otherSourcingId, supplierId,
    })
    await db.insert(schema.purchaseOrders).values({
      id: otherPoId, supplierId, poNumber: "PO-OTHER-1", status: "received", procurementCaseId: otherCaseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: otherPoLineId, purchaseOrderId: otherPoId, itemDescription: "Reserved Laptop", qtyOrdered: 1, qtyReceived: 1,
    })
    await db.insert(schema.orderUnits).values({
      id: createId(), purchaseOrderLineId: otherPoLineId, purchaseOrderId: otherPoId,
      serialNumber: "SERIAL-OTHER-1", status: "in_stock",
    })

    // A fresh order with no chain of its own: sees the free unit only.
    const customerId = createId()
    const orderId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Fresh Customer" })
    await db.insert(schema.orders).values({ id: orderId, orderNumber: "40404", customerId })

    const { getAvailableOrderUnitsCore } = await import("./orders")
    const units = await db.transaction((tx) => getAvailableOrderUnitsCore(tx, orderId))

    const serials = units.map((u) => u.serialNumber)
    expect(serials).toContain("SERIAL-FREE-1")
    expect(serials).not.toContain("SERIAL-OTHER-1")
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
