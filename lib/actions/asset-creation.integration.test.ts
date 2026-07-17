// Integration coverage for createAssetCore (Milestone 2 / B3): the minimal
// asset-creation path, atomically inserting order_unit + emitting AssetCreated.
// Not an asset transition (no existing row to transition) — a separate path
// from applyAssetTransition per the OI-2/M2 design decision.
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
  dir = mkdtempSync(join(tmpdir(), "asset-creation-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
  // Point the shared db import at this ephemeral instance for createAssetCore's
  // nextAssetTag helper, which is called with the tx handle we pass in — no
  // module mocking needed since createAssetCore takes `tx` as a parameter.
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedOrderLine() {
  const orderId = createId()
  const lineId = createId()
  const customerId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: "IT_CUSTOMER" })
  await db.insert(schema.orders).values({ id: orderId, orderNumber: "IT-" + lineId.slice(-8), customerId })
  await db.insert(schema.orderLines).values({ id: lineId, orderId, description: "IT device", quantity: 1 })
  return { orderId, lineId }
}

async function domainEventTypesFor(assetId: string) {
  const rows = await db
    .select({ eventType: schema.domainEvents.eventType })
    .from(schema.domainEvents)
    .where(eq(schema.domainEvents.aggregateId, assetId))
  return rows.map((r) => r.eventType)
}

describe("createAssetCore", () => {
  test("creates an in_stock asset, writes exactly one AssetCreated event", async () => {
    const { createAssetCore } = await import("./assets")
    const { lineId } = await seedOrderLine()

    let assetId = ""
    await db.transaction(async (tx) => {
      const result = await createAssetCore(tx, { orderLineId: lineId, serialNumber: "SN-001" }, "u1")
      assetId = result.assetId
    })

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    expect(unit.status).toBe("in_stock")
    expect(unit.serialNumber).toBe("SN-001")
    expect(unit.assetTag).toMatch(/^KARA-\d{5}$/)

    const events = await domainEventTypesFor(assetId)
    expect(events).toEqual(["AssetCreated"])
  })

  test("uses a caller-supplied asset tag when provided", async () => {
    const { createAssetCore } = await import("./assets")
    const { lineId } = await seedOrderLine()

    let assetId = ""
    await db.transaction(async (tx) => {
      const result = await createAssetCore(tx, { orderLineId: lineId, serialNumber: "SN-002", assetTag: "KARA-CUSTOM" }, "u1")
      assetId = result.assetId
    })

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    expect(unit.assetTag).toBe("KARA-CUSTOM")
  })

  test("rejects a duplicate asset tag, no row inserted, no event emitted", async () => {
    const { createAssetCore } = await import("./assets")
    const { lineId } = await seedOrderLine()

    await db.transaction(async (tx) => {
      await createAssetCore(tx, { orderLineId: lineId, serialNumber: "SN-003", assetTag: "KARA-DUP" }, "u1")
    })

    const before = await db.select().from(schema.orderUnits)
    const beforeCount = before.length

    await expect(
      db.transaction(async (tx) => {
        await createAssetCore(tx, { orderLineId: lineId, serialNumber: "SN-004", assetTag: "KARA-DUP" }, "u1")
      })
    ).rejects.toThrow("Asset tag already in use")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(beforeCount)
  })

  test("treats serial numbers as case-insensitive and whitespace-normalized", async () => {
    const { createAssetCore } = await import("./assets")
    const first = await seedOrderLine()
    const second = await seedOrderLine()

    await db.transaction(async (tx) => {
      await createAssetCore(
        tx,
        { orderLineId: first.lineId, serialNumber: "  sn-mixed-01  ", assetTag: "KARA-SERIAL-A" },
        "u1"
      )
    })

    await expect(
      db.transaction(async (tx) => {
        await createAssetCore(
          tx,
          { orderLineId: second.lineId, serialNumber: "SN-MIXED-01", assetTag: "KARA-SERIAL-B" },
          "u1"
        )
      })
    ).rejects.toThrow("Serial number already in use")

    const rows = await db.select().from(schema.orderUnits)
    const matching = rows.filter((row) => row.serialNumber?.toUpperCase() === "SN-MIXED-01")
    expect(matching).toHaveLength(1)
    expect(matching[0].serialNumber).toBe("SN-MIXED-01")
  })

  test("rejects an unknown order line, no row inserted, no event emitted", async () => {
    const { createAssetCore } = await import("./assets")
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await createAssetCore(tx, { orderLineId: createId(), serialNumber: "SN-005" }, "u1")
      })
    ).rejects.toThrow("Order line not found")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })

  test("rejects a cancelled purchase order line, no row inserted", async () => {
    const { createAssetCore } = await import("./assets")
    const supplierId = createId()
    const poId = createId()
    const lineId = createId()
    const procurementCaseId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_SUPPLIER" })
    await db.insert(schema.procurementCases).values({ id: procurementCaseId, source: "system_manual" })
    await db.insert(schema.purchaseOrders).values({
      id: poId,
      supplierId,
      poNumber: "PO-" + lineId.slice(-8),
      status: "ordered",
      procurementCaseId,
    })
    await db.insert(schema.purchaseOrderLines).values({
      id: lineId,
      purchaseOrderId: poId,
      itemDescription: "IT laptop",
      qtyOrdered: 1,
      status: "cancelled",
      cancelledAt: Date.now(),
    })

    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await createAssetCore(tx, { purchaseOrderLineId: lineId, serialNumber: "SN-CANCELLED" }, "u1")
      })
    ).rejects.toThrow("cancelled purchase order line")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })

  test("rejects a blank serial number at the schema layer", async () => {
    const { createAssetCore } = await import("./assets")
    const { lineId } = await seedOrderLine()

    await expect(
      db.transaction(async (tx) => {
        await createAssetCore(tx, { orderLineId: lineId, serialNumber: "" }, "u1")
      })
    ).rejects.toThrow()
  })
})
