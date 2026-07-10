// Integration coverage for Milestone 3 / P5 warranty assignment: assignWarrantyCore
// atomically inserts warranty_assignment, increments warranty_batch.unitsAssigned,
// and emits WarrantyAssigned — a separate module from asset status transitions.
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
  dir = mkdtempSync(join(tmpdir(), "warranty-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedAsset() {
  const customerId = createId()
  const orderId = createId()
  const lineId = createId()
  const assetId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: "IT_CUSTOMER" })
  await db.insert(schema.orders).values({ id: orderId, orderNumber: "IT-" + assetId.slice(-8), customerId })
  await db.insert(schema.orderLines).values({ id: lineId, orderId, description: "IT device", quantity: 1 })
  await db.insert(schema.orderUnits).values({ id: assetId, orderLineId: lineId, orderId, status: "in_stock" })
  return { assetId }
}

async function seedWarrantyBatch(unitsCovered = 1) {
  const productId = createId()
  const batchId = createId()
  await db.insert(schema.warrantyProducts).values({ id: productId, nameAr: "ضمان", nameEn: "Warranty", durationMonths: 12 })
  await db.insert(schema.warrantyBatches).values({ id: batchId, warrantyProductId: productId, source: "with_device", unitsCovered })
  return { batchId }
}

describe("assignWarrantyCore", () => {
  test("assigns warranty, increments batch.unitsAssigned, emits exactly one WarrantyAssigned event", async () => {
    const { assignWarrantyCore } = await import("./warranty")
    const { assetId } = await seedAsset()
    const { batchId } = await seedWarrantyBatch(1)

    let assignmentId = ""
    await db.transaction(async (tx) => {
      const result = await assignWarrantyCore(tx, { assetId, warrantyBatchId: batchId }, "u1")
      assignmentId = result.id
    })

    const [assignment] = await db.select().from(schema.warrantyAssignments).where(eq(schema.warrantyAssignments.id, assignmentId))
    expect(assignment.status).toBe("assigned_not_activated")

    const [batch] = await db.select().from(schema.warrantyBatches).where(eq(schema.warrantyBatches.id, batchId))
    expect(batch.unitsAssigned).toBe(1)

    const events = await db
      .select({ eventType: schema.domainEvents.eventType })
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.aggregateId, assetId))
    expect(events.filter((e) => e.eventType === "WarrantyAssigned").length).toBe(1)
  })

  test("rejects assigning a fully-assigned batch, no row inserted", async () => {
    const { assignWarrantyCore } = await import("./warranty")
    const { assetId: asset1 } = await seedAsset()
    const { assetId: asset2 } = await seedAsset()
    const { batchId } = await seedWarrantyBatch(1)

    await db.transaction(async (tx) => {
      await assignWarrantyCore(tx, { assetId: asset1, warrantyBatchId: batchId }, "u1")
    })
    const before = await db.select().from(schema.warrantyAssignments)

    await expect(
      db.transaction(async (tx) => {
        await assignWarrantyCore(tx, { assetId: asset2, warrantyBatchId: batchId }, "u1")
      })
    ).rejects.toThrow("Warranty batch fully assigned")

    const after = await db.select().from(schema.warrantyAssignments)
    expect(after.length).toBe(before.length)
  })

  test("rejects a second active assignment on the same asset", async () => {
    const { assignWarrantyCore } = await import("./warranty")
    const { assetId } = await seedAsset()
    const { batchId: batch1 } = await seedWarrantyBatch(1)
    const { batchId: batch2 } = await seedWarrantyBatch(1)

    await db.transaction(async (tx) => {
      await assignWarrantyCore(tx, { assetId, warrantyBatchId: batch1 }, "u1")
    })

    await expect(
      db.transaction(async (tx) => {
        await assignWarrantyCore(tx, { assetId, warrantyBatchId: batch2 }, "u1")
      })
    ).rejects.toThrow("Asset already has an active warranty assignment")
  })

  test("rejects an unknown asset, no row inserted", async () => {
    const { assignWarrantyCore } = await import("./warranty")
    const { batchId } = await seedWarrantyBatch(1)
    const before = await db.select().from(schema.warrantyAssignments)

    await expect(
      db.transaction(async (tx) => {
        await assignWarrantyCore(tx, { assetId: createId(), warrantyBatchId: batchId }, "u1")
      })
    ).rejects.toThrow("Asset not found")

    const after = await db.select().from(schema.warrantyAssignments)
    expect(after.length).toBe(before.length)
  })
})
