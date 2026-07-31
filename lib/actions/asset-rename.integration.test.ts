// Integration coverage for renameAssetCore + the display-name resolution it
// feeds: an asset's own device name (order_unit.model) masks the description of
// the order/PO line it was minted from, and clearing it falls back to that line
// again. Not a lifecycle transition — logged as a "correction" event instead.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { assetDisplayNameSql } from "@/lib/db/asset-name"
import { createId } from "@/lib/utils/ids"
import { renameAssetCore } from "@/lib/actions/assets"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "asset-rename-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedAsset(lineDescription: string) {
  const customerId = createId()
  const orderId = createId()
  const lineId = createId()
  const unitId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: "IT_RENAME_" + unitId.slice(-6) })
  await db
    .insert(schema.orders)
    .values({ id: orderId, orderNumber: "IT-R-" + unitId.slice(-8), customerId })
  await db
    .insert(schema.orderLines)
    .values({ id: lineId, orderId, description: lineDescription, quantity: 2 })
  await db
    .insert(schema.orderUnits)
    .values({ id: unitId, orderId, orderLineId: lineId, serialNumber: "SN-" + unitId.slice(-8) })
  return { unitId, lineId, orderId }
}

async function displayNameOf(unitId: string): Promise<string> {
  const [row] = await db
    .select({ name: assetDisplayNameSql(schema.orderLines.description) })
    .from(schema.orderUnits)
    .leftJoin(schema.orderLines, eq(schema.orderUnits.orderLineId, schema.orderLines.id))
    .where(eq(schema.orderUnits.id, unitId))
  return row.name
}

async function eventsOf(unitId: string) {
  return db.select().from(schema.assetEvents).where(eq(schema.assetEvents.assetId, unitId))
}

describe("renameAssetCore", () => {
  test("asset with no override shows its origin line description", async () => {
    const { unitId } = await seedAsset("Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB")
    expect(await displayNameOf(unitId)).toBe("Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB")
  })

  test("rename masks the line description and logs a correction event", async () => {
    const { unitId } = await seedAsset("Generic tablet")
    const actorId = createId()

    const result = await db.transaction((tx) =>
      renameAssetCore(tx, unitId, "Apple iPad 10th Gen, Wi-Fi, 10.9 inch", actorId)
    )

    expect(result).toEqual({ assetId: unitId, previous: null })
    expect(await displayNameOf(unitId)).toBe("Apple iPad 10th Gen, Wi-Fi, 10.9 inch")

    const events = await eventsOf(unitId)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("correction")
    expect(events[0].notes).toBe("— → Apple iPad 10th Gen, Wi-Fi, 10.9 inch")
    expect(events[0].byUserId).toBe(actorId)
  })

  test("renaming one asset leaves its siblings on the same line untouched", async () => {
    const { unitId, lineId, orderId } = await seedAsset("Shared line device")
    const siblingId = createId()
    await db
      .insert(schema.orderUnits)
      .values({ id: siblingId, orderId, orderLineId: lineId, serialNumber: "SN-" + siblingId.slice(-8) })

    await db.transaction((tx) => renameAssetCore(tx, unitId, "Renamed device", null))

    expect(await displayNameOf(unitId)).toBe("Renamed device")
    expect(await displayNameOf(siblingId)).toBe("Shared line device")
  })

  test("clearing the name falls back to the line description", async () => {
    const { unitId } = await seedAsset("Fallback device")
    await db.transaction((tx) => renameAssetCore(tx, unitId, "Temporary name", null))

    const result = await db.transaction((tx) => renameAssetCore(tx, unitId, null, null))

    expect(result.previous).toBe("Temporary name")
    expect(await displayNameOf(unitId)).toBe("Fallback device")
    expect(await eventsOf(unitId)).toHaveLength(2)
  })

  test("a whitespace-only override does not mask the line description", async () => {
    const { unitId } = await seedAsset("Blank-guard device")
    await db.transaction((tx) => renameAssetCore(tx, unitId, "   ", null))
    expect(await displayNameOf(unitId)).toBe("Blank-guard device")
  })

  test("re-saving the same name writes no event", async () => {
    const { unitId } = await seedAsset("Idempotent device")
    await db.transaction((tx) => renameAssetCore(tx, unitId, "Same name", null))
    await db.transaction((tx) => renameAssetCore(tx, unitId, "Same name", null))
    expect(await eventsOf(unitId)).toHaveLength(1)
  })

  test("unknown asset id is rejected", async () => {
    await expect(
      db.transaction((tx) => renameAssetCore(tx, "does-not-exist", "Name", null))
    ).rejects.toThrow("Asset not found")
  })
})
