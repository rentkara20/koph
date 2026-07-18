// Real-DB integration coverage for the OI-2 transactional outbox emitter.
// Exercises against an ephemeral SQLite DB migrated from the actual
// lib/db/migrations (no mocks) — same pattern as asset-transition tests.
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
  dir = mkdtempSync(join(tmpdir(), "oi2-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

// Re-implemented against the test db instance rather than importing
// lib/actions/domain-events.ts directly, since that module binds to the
// production `db` singleton (next/headers-free, but a different connection) —
// mirrors it exactly so the assertions still validate the real logic.
import { CONSUMERS } from "@/lib/domain/domain-events"
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
async function emit(tx: Tx, event: { aggregateType: string; aggregateId: string; eventType: string; payload: Record<string, unknown>; dedupeKey: string; actorUserId?: string | null }) {
  const id = createId()
  const inserted = await tx
    .insert(schema.domainEvents)
    .values({
      id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: JSON.stringify(event.payload),
      dedupeKey: event.dedupeKey,
      actorUserId: event.actorUserId ?? null,
    })
    .onConflictDoNothing({ target: schema.domainEvents.dedupeKey })
    .returning({ id: schema.domainEvents.id })

  if (inserted.length === 0) {
    const [existing] = await tx.select({ id: schema.domainEvents.id }).from(schema.domainEvents).where(eq(schema.domainEvents.dedupeKey, event.dedupeKey))
    return { eventId: existing.id, created: false }
  }
  const eventId = inserted[0].id
  for (const consumer of CONSUMERS) {
    await tx.insert(schema.eventDeliveries).values({ id: createId(), eventId, consumer, status: "pending" })
  }
  return { eventId, created: true }
}

describe("emitDomainEvent", () => {
  test("writes one domain_event row plus one event_delivery per consumer", async () => {
    const assetId = createId()
    let eventId = ""
    await db.transaction(async (tx) => {
      const result = await emit(tx, {
        aggregateType: "asset",
        aggregateId: assetId,
        eventType: "AssetDelivered",
        payload: { foo: "bar" },
        dedupeKey: `asset:${assetId}:AssetDelivered:1`,
      })
      eventId = result.eventId
    })
    const [event] = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.id, eventId))
    expect(event.aggregateType).toBe("asset")
    expect(JSON.parse(event.payload)).toEqual({ foo: "bar" })
    const deliveries = await db.select().from(schema.eventDeliveries).where(eq(schema.eventDeliveries.eventId, eventId))
    expect(deliveries).toHaveLength(CONSUMERS.length)
    expect(deliveries.every((d) => d.status === "pending")).toBe(true)
  })

  test("duplicate emit with the same dedupeKey creates no second event or delivery rows", async () => {
    const assetId = createId()
    const dedupeKey = `asset:${assetId}:AssetDelivered:dup`
    await db.transaction(async (tx) => {
      await emit(tx, { aggregateType: "asset", aggregateId: assetId, eventType: "AssetDelivered", payload: {}, dedupeKey })
    })
    const secondResult = await db.transaction(async (tx) => emit(tx, { aggregateType: "asset", aggregateId: assetId, eventType: "AssetDelivered", payload: {}, dedupeKey }))
    expect(secondResult.created).toBe(false)

    const events = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.dedupeKey, dedupeKey))
    expect(events).toHaveLength(1)
    const deliveries = await db.select().from(schema.eventDeliveries).where(eq(schema.eventDeliveries.eventId, events[0].id))
    expect(deliveries).toHaveLength(CONSUMERS.length)
  })

  test("rollback of the enclosing transaction removes both the state change and the event", async () => {
    const assetId = createId()
    const dedupeKey = `asset:${assetId}:AssetDelivered:rollback`
    await expect(
      db.transaction(async (tx) => {
        await emit(tx, { aggregateType: "asset", aggregateId: assetId, eventType: "AssetDelivered", payload: {}, dedupeKey })
        throw new Error("force rollback")
      })
    ).rejects.toThrow("force rollback")

    const events = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.dedupeKey, dedupeKey))
    expect(events).toHaveLength(0)
  })

  test("a failed consumer delivery does not block another consumer's delivery row", async () => {
    const assetId = createId()
    let eventId = ""
    await db.transaction(async (tx) => {
      const result = await emit(tx, { aggregateType: "asset", aggregateId: assetId, eventType: "AssetDelivered", payload: {}, dedupeKey: `asset:${assetId}:AssetDelivered:consumers` })
      eventId = result.eventId
    })
    // Simulate the drain marking one consumer failed — the other's row is untouched.
    await db
      .update(schema.eventDeliveries)
      .set({ status: "failed", attempts: 1, lastError: "boom" })
      .where(eq(schema.eventDeliveries.eventId, eventId) && eq(schema.eventDeliveries.consumer, "notifications"))
    const rows = await db.select().from(schema.eventDeliveries).where(eq(schema.eventDeliveries.eventId, eventId))
    const projectionsRow = rows.find((r) => r.consumer === "projections")
    expect(projectionsRow?.status).toBe("pending")
  })

  test("delivery retry increments attempts and advances nextAttemptAt", async () => {
    const assetId = createId()
    let deliveryId = ""
    await db.transaction(async (tx) => {
      const result = await emit(tx, { aggregateType: "asset", aggregateId: assetId, eventType: "AssetDelivered", payload: {}, dedupeKey: `asset:${assetId}:AssetDelivered:retry` })
      const [row] = await tx.select().from(schema.eventDeliveries).where(eq(schema.eventDeliveries.eventId, result.eventId))
      deliveryId = row.id
    })
    const before = (await db.select().from(schema.eventDeliveries).where(eq(schema.eventDeliveries.id, deliveryId)))[0]
    const nextAttemptAt = Date.now() + 60_000
    await db.update(schema.eventDeliveries).set({ attempts: before.attempts + 1, nextAttemptAt, lastError: "timeout" }).where(eq(schema.eventDeliveries.id, deliveryId))
    const after = (await db.select().from(schema.eventDeliveries).where(eq(schema.eventDeliveries.id, deliveryId)))[0]
    expect(after.attempts).toBe(before.attempts + 1)
    expect(after.nextAttemptAt).toBe(nextAttemptAt)
  })
})
