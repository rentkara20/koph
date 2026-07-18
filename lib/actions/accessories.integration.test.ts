// Integration coverage for Milestone 3 / P6: attachAccessoryCore /
// updateAccessoryChecklistCore atomically move stock/units and emit
// AccessoryAttached / AccessoryReturned — not asset status transitions.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "accessories-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("attachAccessoryCore / updateAccessoryChecklistCore", () => {
  test("non_serialized: attach decrements stock, collect restocks, emits both events once", async () => {
    const { attachAccessoryCore, updateAccessoryChecklistCore } = await import("./accessories")
    const itemId = createId()
    await db.insert(schema.accessoryItems).values({ id: itemId, nameAr: "شاحن", nameEn: "Charger", category: "non_serialized", requiresSerial: false })
    await db.insert(schema.accessoryStock).values({ id: createId(), accessoryItemId: itemId, location: "main_warehouse", qty: 5 })

    let attachmentId = ""
    await db.transaction(async (tx) => {
      const r = await attachAccessoryCore(tx, { entityType: "asset", entityId: "asset-1", accessoryItemId: itemId, qty: 1 }, "u1")
      attachmentId = r.id
    })

    const [stockAfterAttach] = await db.select().from(schema.accessoryStock).where(eq(schema.accessoryStock.accessoryItemId, itemId))
    expect(stockAfterAttach.qty).toBe(4)

    const attachEvents = await db.select({ eventType: schema.domainEvents.eventType }).from(schema.domainEvents).where(eq(schema.domainEvents.aggregateId, "asset-1"))
    expect(attachEvents.filter((e) => e.eventType === "AccessoryAttached").length).toBe(1)

    await db.transaction(async (tx) => {
      await updateAccessoryChecklistCore(tx, { attachmentId, checklistState: "collected" }, "u1")
    })

    const [stockAfterCollect] = await db.select().from(schema.accessoryStock).where(eq(schema.accessoryStock.accessoryItemId, itemId))
    expect(stockAfterCollect.qty).toBe(5)

    const returnEvents = await db.select({ eventType: schema.domainEvents.eventType }).from(schema.domainEvents).where(eq(schema.domainEvents.aggregateId, "asset-1"))
    expect(returnEvents.filter((e) => e.eventType === "AccessoryReturned").length).toBe(1)
  })

  test("rejects attach when stock is insufficient, no attachment row inserted", async () => {
    const { attachAccessoryCore } = await import("./accessories")
    const itemId = createId()
    await db.insert(schema.accessoryItems).values({ id: itemId, nameAr: "كابل", nameEn: "Cable", category: "non_serialized", requiresSerial: false })
    await db.insert(schema.accessoryStock).values({ id: createId(), accessoryItemId: itemId, location: "main_warehouse", qty: 0 })

    const before = await db.select().from(schema.accessoryAttachments)
    await expect(
      db.transaction(async (tx) => {
        await attachAccessoryCore(tx, { entityType: "asset", entityId: "asset-2", accessoryItemId: itemId, qty: 1 }, "u1")
      })
    ).rejects.toThrow("Not enough stock for this accessory")
    const after = await db.select().from(schema.accessoryAttachments)
    expect(after.length).toBe(before.length)
  })

  test("trackable: attach marks unit assigned, collect returns it to in_stock", async () => {
    const { attachAccessoryCore, updateAccessoryChecklistCore } = await import("./accessories")
    const itemId = createId()
    const unitId = createId()
    await db.insert(schema.accessoryItems).values({ id: itemId, nameAr: "حقيبة", nameEn: "Bag", category: "trackable", requiresSerial: false })
    await db.insert(schema.accessoryUnits).values({ id: unitId, accessoryItemId: itemId, status: "in_stock" })

    let attachmentId = ""
    await db.transaction(async (tx) => {
      const r = await attachAccessoryCore(tx, { entityType: "asset", entityId: "asset-3", accessoryItemId: itemId, accessoryUnitId: unitId }, "u1")
      attachmentId = r.id
    })
    const [assigned] = await db.select().from(schema.accessoryUnits).where(eq(schema.accessoryUnits.id, unitId))
    expect(assigned.status).toBe("assigned")

    await db.transaction(async (tx) => {
      await updateAccessoryChecklistCore(tx, { attachmentId, checklistState: "collected" }, "u1")
    })
    const [returned] = await db.select().from(schema.accessoryUnits).where(eq(schema.accessoryUnits.id, unitId))
    expect(returned.status).toBe("in_stock")
  })

  test("rejects attaching an already-assigned unit, no attachment row inserted", async () => {
    const { attachAccessoryCore } = await import("./accessories")
    const itemId = createId()
    const unitId = createId()
    await db.insert(schema.accessoryItems).values({ id: itemId, nameAr: "فأرة", nameEn: "Mouse", category: "trackable", requiresSerial: false })
    await db.insert(schema.accessoryUnits).values({ id: unitId, accessoryItemId: itemId, status: "assigned" })

    const before = await db.select().from(schema.accessoryAttachments)
    await expect(
      db.transaction(async (tx) => {
        await attachAccessoryCore(tx, { entityType: "asset", entityId: "asset-4", accessoryItemId: itemId, accessoryUnitId: unitId }, "u1")
      })
    ).rejects.toThrow("Accessory unit is not available")
    const after = await db.select().from(schema.accessoryAttachments)
    expect(after.length).toBe(before.length)
  })

  test("missing/damaged keeps the unit out of stock", async () => {
    const { attachAccessoryCore, updateAccessoryChecklistCore } = await import("./accessories")
    const itemId = createId()
    const unitId = createId()
    await db.insert(schema.accessoryItems).values({ id: itemId, nameAr: "سماعة", nameEn: "Headset", category: "trackable", requiresSerial: false })
    await db.insert(schema.accessoryUnits).values({ id: unitId, accessoryItemId: itemId, status: "in_stock" })

    let attachmentId = ""
    await db.transaction(async (tx) => {
      const r = await attachAccessoryCore(tx, { entityType: "asset", entityId: "asset-5", accessoryItemId: itemId, accessoryUnitId: unitId }, "u1")
      attachmentId = r.id
    })
    await db.transaction(async (tx) => {
      await updateAccessoryChecklistCore(tx, { attachmentId, checklistState: "damaged" }, "u1")
    })
    const [unit] = await db.select().from(schema.accessoryUnits).where(eq(schema.accessoryUnits.id, unitId))
    expect(unit.status).toBe("damaged")
  })

  test("double-collect of the same attachment restocks qty only once (no inflation)", async () => {
    const { attachAccessoryCore, updateAccessoryChecklistCore } = await import("./accessories")
    const itemId = createId()
    await db.insert(schema.accessoryItems).values({ id: itemId, nameAr: "سلك", nameEn: "Cord", category: "non_serialized", requiresSerial: false })
    await db.insert(schema.accessoryStock).values({ id: createId(), accessoryItemId: itemId, location: "main_warehouse", qty: 3 })

    let attachmentId = ""
    await db.transaction(async (tx) => {
      const r = await attachAccessoryCore(tx, { entityType: "asset", entityId: "asset-6", accessoryItemId: itemId, qty: 2 }, "u1")
      attachmentId = r.id
    })
    // 3 - 2 = 1 in stock, 2 out
    const [afterAttach] = await db.select().from(schema.accessoryStock).where(eq(schema.accessoryStock.accessoryItemId, itemId))
    expect(afterAttach.qty).toBe(1)

    await db.transaction(async (tx) => {
      await updateAccessoryChecklistCore(tx, { attachmentId, checklistState: "collected" }, "u1")
    })
    // second collect (double-click) must be a no-op, not another +2
    await db.transaction(async (tx) => {
      await updateAccessoryChecklistCore(tx, { attachmentId, checklistState: "collected" }, "u1")
    })

    const [afterCollect] = await db.select().from(schema.accessoryStock).where(eq(schema.accessoryStock.accessoryItemId, itemId))
    expect(afterCollect.qty).toBe(3) // restored to 3, NOT 5

    const returnEvents = await db
      .select({ eventType: schema.domainEvents.eventType })
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.aggregateId, "asset-6"))
    expect(returnEvents.filter((e) => e.eventType === "AccessoryReturned").length).toBe(1)
  })
})
