import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { deriveRequestStatus } from "@/lib/domain/request-status"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "office-pickup-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("office pickup schema and status derivation", () => {
  it("defaults every existing request to partner delivery", async () => {
    const customerId = createId()
    const typeId = createId()
    const requestId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Customer" })
    await db.insert(schema.requestTypes).values({ id: typeId, slug: "delivery", nameAr: "تسليم", nameEn: "Delivery" })
    await db.insert(schema.requests).values({
      id: requestId,
      requestNumber: "KR-TEST-0001",
      trackingCode: createId(),
      typeId,
      customerId,
      status: "draft",
    })

    const [req] = await db.select().from(schema.requests).where(eq(schema.requests.id, requestId))
    // The column is additive: nothing about existing requests changes.
    expect(req.fulfilmentMode).toBe("partner_delivery")
    expect(req.pickupHandedOverBy).toBeNull()
    expect(req.pickupHandedOverAt).toBeNull()
  })

  it("stores who handed the devices over the counter", async () => {
    const customerId = createId()
    const typeId = createId()
    const userId = createId()
    const requestId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Customer 2" })
    await db.insert(schema.requestTypes).values({ id: typeId, slug: "installation", nameAr: "تركيب", nameEn: "Installation" })
    await db.insert(schema.users).values({ id: userId, name: "Ops Staff", email: `${userId}@example.com` })
    await db.insert(schema.requests).values({
      id: requestId,
      requestNumber: "KR-TEST-0002",
      trackingCode: createId(),
      typeId,
      customerId,
      status: "completed",
      fulfilmentMode: "customer_pickup",
      pickupHandedOverBy: userId,
      pickupHandedOverAt: 1_800_000_000_000,
    })

    const [req] = await db.select().from(schema.requests).where(eq(schema.requests.id, requestId))
    expect(req.fulfilmentMode).toBe("customer_pickup")
    expect(req.pickupHandedOverBy).toBe(userId)
  })

  // This is the bug that stranded 70 devices on order 10693: with no partner
  // task there is nothing to derive a status from, so the request can never
  // leave draft on its own. The office-pickup action is the only way out, and
  // this test states that plainly so nobody "fixes" it by guessing a status.
  it("cannot derive a status for a request with no partner tasks", () => {
    expect(deriveRequestStatus("draft", [])).toBeNull()
    expect(deriveRequestStatus("assigned", [])).toBeNull()
  })

  it("leaves a completed pickup alone if a task is added afterwards", () => {
    // completed is not a manual status, so a later task would move it — the
    // action sets completed, and ops should not attach tasks to a closed pickup.
    expect(deriveRequestStatus("completed", ["closed"])).toBeNull()
  })
})
