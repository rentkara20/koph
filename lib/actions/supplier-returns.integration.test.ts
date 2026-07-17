import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "supplier-return-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedDamagedAsset() {
  const supplierId = createId()
  const caseId = createId()
  const purchaseOrderId = createId()
  const lineId = createId()
  const assetId = createId()
  await db.insert(schema.suppliers).values({ id: supplierId, name: "Return supplier" })
  await db.insert(schema.procurementCases).values({ id: caseId, source: "system_manual" })
  await db.insert(schema.purchaseOrders).values({
    id: purchaseOrderId,
    supplierId,
    procurementCaseId: caseId,
    poNumber: `PO-${purchaseOrderId}`,
    status: "received",
    qcRequired: true,
  })
  await db.insert(schema.purchaseOrderLines).values({
    id: lineId,
    purchaseOrderId,
    itemDescription: "Laptop",
    qtyOrdered: 1,
    qtyReceived: 1,
    status: "active",
  })
  await db.insert(schema.orderUnits).values({
    id: assetId,
    purchaseOrderLineId: lineId,
    purchaseOrderId,
    serialNumber: "BAD-001",
    status: "damaged",
  })
  return { assetId, purchaseOrderId }
}

describe("supplier return workflow", () => {
  it("returns a rejected device and receives its replacement through QC", async () => {
    const { assetId } = await seedDamagedAsset()
    const {
      createSupplierReturnCore,
      confirmSupplierReturnCore,
      receiveSupplierReplacementCore,
    } = await import("./supplier-returns")

    const created = await db.transaction((tx) =>
      createSupplierReturnCore(tx, {
        assetId,
        resolution: "replacement",
        reason: "Screen cracked on arrival",
      }, null)
    )
    await db.transaction((tx) => confirmSupplierReturnCore(tx, created.id, "RMA-77", null))
    const replacement = await db.transaction((tx) =>
      receiveSupplierReplacementCore(tx, created.id, "GOOD-002", null)
    )

    const [oldAsset] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    const [newAsset] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, replacement.assetId))
    const [supplierReturn] = await db
      .select()
      .from(schema.supplierReturns)
      .where(eq(schema.supplierReturns.id, created.id))

    expect(oldAsset.status).toBe("supplier_returned")
    expect(newAsset.status).toBe("receiving_qc")
    expect(supplierReturn.status).toBe("replacement_received")
    expect(supplierReturn.replacementAssetId).toBe(newAsset.id)
    expect(supplierReturn.rmaReference).toBe("RMA-77")
  })
})
