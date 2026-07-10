// Integration coverage for Milestone 3 / P4 procurement receiving:
// receivePurchaseOrderLineCore atomically creates an Asset (via the same
// createAssetCore chokepoint used by the client order-line flow), increments
// qtyReceived, recomputes PO status, and emits PurchaseOrderLineReceived.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
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
  dir = mkdtempSync(join(tmpdir(), "procurement-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedPurchaseOrder(qtyOrdered = 1) {
  const supplierId = createId()
  const poId = createId()
  const lineId = createId()
  await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_SUPPLIER" })
  await db.insert(schema.purchaseOrders).values({
    id: poId,
    supplierId,
    poNumber: "PO-" + lineId.slice(-8),
    status: "ordered",
  })
  await db.insert(schema.purchaseOrderLines).values({
    id: lineId,
    purchaseOrderId: poId,
    itemDescription: "IT laptop",
    qtyOrdered,
  })
  return { poId, lineId }
}

describe("receivePurchaseOrderLineCore", () => {
  test("creates an asset with purchaseOrderLineId origin, no client order-line", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineId } = await seedPurchaseOrder(1)

    let assetId = ""
    await db.transaction(async (tx) => {
      const result = await receivePurchaseOrderLineCore(
        tx,
        { purchaseOrderLineId: lineId, serialNumber: "PO-SN-001" },
        "u1"
      )
      assetId = result.assetId
    })

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    expect(unit.purchaseOrderLineId).toBe(lineId)
    expect(unit.orderLineId).toBeNull()
    expect(unit.serialNumber).toBe("PO-SN-001")

    const [line] = await db.select().from(schema.purchaseOrderLines).where(eq(schema.purchaseOrderLines.id, lineId))
    expect(line.qtyReceived).toBe(1)
  })

  test("marks PO received once every line is fully received", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { poId, lineId } = await seedPurchaseOrder(1)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-002" }, "u1")
    })

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("received")
  })

  test("marks PO partially_received when only some units are in", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { poId, lineId } = await seedPurchaseOrder(2)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-003" }, "u1")
    })

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("partially_received")
  })

  test("rejects receiving more than ordered, no row inserted", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineId } = await seedPurchaseOrder(1)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-004" }, "u1")
    })
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-005" }, "u1")
      })
    ).rejects.toThrow("Cannot receive more than ordered")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })

  test("rejects a duplicate serial number across origins, no row inserted", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineId: lineA } = await seedPurchaseOrder(2)
    const { lineId: lineB } = await seedPurchaseOrder(2)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineA, serialNumber: "PO-SN-DUP" }, "u1")
    })
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineB, serialNumber: "PO-SN-DUP" }, "u1")
      })
    ).rejects.toThrow("Serial number already in use")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })

  test("rejects an unknown purchase order line, no row inserted", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(
          tx,
          { purchaseOrderLineId: createId(), serialNumber: "PO-SN-006" },
          "u1"
        )
      })
    ).rejects.toThrow("Purchase order line not found")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })
})
