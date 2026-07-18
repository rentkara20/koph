// Integration coverage for Milestone 4 / P7: the outbox notifications
// consumer turns domain events into admin in-app notifications, idempotently,
// excluding the actor. Runs against an ephemeral migrated libsql DB.
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
import { deliverNotificationsForEvent } from "./notification-consumer"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

async function makeAdmin(name: string): Promise<string> {
  const id = createId()
  await db.insert(schema.users).values({
    id,
    name,
    email: `${id}@example.com`,
    role: "admin",
  })
  return id
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "notif-consumer-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("deliverNotificationsForEvent", () => {
  test("fans a mapped event out to every admin with correct type and link", async () => {
    const a1 = await makeAdmin("Admin One")
    const a2 = await makeAdmin("Admin Two")
    const eventId = createId()

    await deliverNotificationsForEvent(db, {
      id: eventId,
      eventType: "RequestCreated",
      aggregateType: "request",
      aggregateId: "req-1",
      actorUserId: null,
      payload: { requestNumber: "R-100" },
    })

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.entityId, "req-1"))

    expect(rows.length).toBe(2)
    const forA1 = rows.find((r) => r.userId === a1)
    const forA2 = rows.find((r) => r.userId === a2)
    expect(forA1).toBeDefined()
    expect(forA2).toBeDefined()
    expect(forA1!.type).toBe("request_created")
    expect(forA1!.i18nKey).toBe("notifications.requestCreated")
    expect(forA1!.linkUrl).toBe("/admin/requests/req-1")
    expect(JSON.parse(forA1!.i18nData!)).toEqual({ requestNumber: "R-100" })
    expect(forA1!.dedupeKey).toBe(`${eventId}:${a1}`)
  })

  test("is idempotent — a retried delivery of the same event inserts no duplicates", async () => {
    await makeAdmin("Retry Admin")
    const eventId = createId()
    const event = {
      id: eventId,
      eventType: "PaymentBatchPaid" as const,
      aggregateType: "payment_batch",
      aggregateId: "batch-9",
      actorUserId: null,
      payload: {},
    }

    await deliverNotificationsForEvent(db, event)
    await deliverNotificationsForEvent(db, event) // retry

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.entityId, "batch-9"))
    expect(rows.length).toBe(await countAdmins())
  })

  test("excludes the actor who triggered the event", async () => {
    const actor = await makeAdmin("Acting Admin")
    const eventId = createId()

    await deliverNotificationsForEvent(db, {
      id: eventId,
      eventType: "SignatureRejected",
      aggregateType: "signature_request",
      aggregateId: "sig-3",
      actorUserId: actor,
      payload: { requestId: "req-7" },
    })

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.entityId, "sig-3"))

    expect(rows.some((r) => r.userId === actor)).toBe(false)
    // and the link falls back to the owning request from the payload
    expect(rows[0]?.linkUrl).toBe("/admin/requests/req-7")
  })

  test("produces nothing for an event type that is not user-facing", async () => {
    await deliverNotificationsForEvent(db, {
      id: createId(),
      eventType: "AssetReserved",
      aggregateType: "asset",
      aggregateId: "asset-xyz",
      actorUserId: null,
      payload: {},
    })

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.entityId, "asset-xyz"))
    expect(rows.length).toBe(0)
  })
})

async function countAdmins(): Promise<number> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "admin"))
  return rows.length
}
