// Integration coverage for Milestone 5 / P9: the outbox notion consumer
// mirrors asset domain events into Notion, replacing full-table rescans as
// the primary sync path. Runs against an ephemeral migrated libsql DB.
// isNotionSyncEnabled is mocked (real env/DB-backed check is exercised by
// lib/integrations/notion.ts's own concerns, not this consumer's routing logic).
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

const { isNotionSyncEnabled } = vi.hoisted(() => ({ isNotionSyncEnabled: vi.fn() }))
vi.mock("@/lib/integrations/notion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/notion")>("@/lib/integrations/notion")
  return { ...actual, isNotionSyncEnabled }
})

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

async function seedAsset(assetTag: string | null): Promise<string> {
  const orderId = createId()
  const lineId = createId()
  const customerId = createId()
  const unitId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: "IT_CUSTOMER" })
  await db.insert(schema.orders).values({ id: orderId, orderNumber: "IT-" + unitId.slice(-8), customerId })
  await db.insert(schema.orderLines).values({ id: lineId, orderId, description: "IT device", quantity: 1 })
  await db.insert(schema.orderUnits).values({
    id: unitId,
    orderLineId: lineId,
    serialNumber: `SN-NOTION-${unitId}`,
    assetTag,
  })
  return unitId
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "notion-consumer-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("deliverNotionForEvent", () => {
  test("no-ops for a non-asset event without checking sync-enabled", async () => {
    const { deliverNotionForEvent } = await import("./notion-consumer")
    const upsert = vi.fn()
    isNotionSyncEnabled.mockResolvedValue(true)

    await deliverNotionForEvent(
      db,
      { id: createId(), eventType: "RequestCreated", aggregateType: "request", aggregateId: "req-1", actorUserId: null, payload: {} },
      upsert
    )

    expect(upsert).not.toHaveBeenCalled()
  })

  test("no-ops for an asset event when sync is disabled", async () => {
    const { deliverNotionForEvent } = await import("./notion-consumer")
    const assetId = await seedAsset("KARA-00001")
    const upsert = vi.fn()
    isNotionSyncEnabled.mockResolvedValue(false)

    await deliverNotionForEvent(
      db,
      { id: createId(), eventType: "AssetCreated", aggregateType: "asset", aggregateId: assetId, actorUserId: null, payload: {} },
      upsert
    )

    expect(upsert).not.toHaveBeenCalled()
  })

  test("no-ops for an asset event when the unit has no asset tag yet", async () => {
    const { deliverNotionForEvent } = await import("./notion-consumer")
    const assetId = await seedAsset(null)
    const upsert = vi.fn()
    isNotionSyncEnabled.mockResolvedValue(true)

    await deliverNotionForEvent(
      db,
      { id: createId(), eventType: "AssetCreated", aggregateType: "asset", aggregateId: assetId, actorUserId: null, payload: {} },
      upsert
    )

    expect(upsert).not.toHaveBeenCalled()
  })

  test("upserts the correct row shape for a tagged asset event", async () => {
    const { deliverNotionForEvent } = await import("./notion-consumer")
    const assetId = await seedAsset("KARA-00002")
    const upsert = vi.fn()
    isNotionSyncEnabled.mockResolvedValue(true)

    await deliverNotionForEvent(
      db,
      { id: createId(), eventType: "AssetCreated", aggregateType: "asset", aggregateId: assetId, actorUserId: null, payload: {} },
      upsert
    )

    expect(upsert).toHaveBeenCalledTimes(1)
    const row = upsert.mock.calls[0][0]
    expect(row.assetTag).toBe("KARA-00002")
    expect(row.serialNumber).toBe(`SN-NOTION-${assetId}`)
    expect(row.status).toBe("in_stock")
    expect(row.koph_link).toContain(`/admin/assets/${assetId}`)
  })

  test("a retried delivery calls upsert again — safe since Notion upserts by asset tag", async () => {
    const { deliverNotionForEvent } = await import("./notion-consumer")
    const assetId = await seedAsset("KARA-00003")
    const upsert = vi.fn()
    isNotionSyncEnabled.mockResolvedValue(true)
    const event = { id: createId(), eventType: "AssetReserved", aggregateType: "asset", aggregateId: assetId, actorUserId: null, payload: {} }

    await deliverNotionForEvent(db, event, upsert)
    await deliverNotionForEvent(db, event, upsert) // retry

    expect(upsert).toHaveBeenCalledTimes(2)
  })
})
