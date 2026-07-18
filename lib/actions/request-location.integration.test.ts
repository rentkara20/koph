import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { resolveCustomerLocationSnapshotCore } from "./requests"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "request-location-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("request customer location snapshot", () => {
  it("copies the selected customer site into a stable request snapshot", async () => {
    const customerId = createId()
    const locationId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Customer" })
    await db.insert(schema.customerLocations).values({
      id: locationId,
      customerId,
      name: "Main warehouse",
      type: "warehouse",
      city: "Riyadh",
      address: "Gate 3",
      mapsLink: "https://maps.example/site",
      latitude: 24.7,
      longitude: 46.6,
    })

    const snapshot = await resolveCustomerLocationSnapshotCore(db, customerId, locationId)
    expect(snapshot).toEqual({
      customerLocationId: locationId,
      locationNameSnapshot: "Main warehouse",
      locationAddressSnapshot: "Riyadh · Gate 3",
      locationMapsLinkSnapshot: "https://maps.example/site",
      locationLatitudeSnapshot: 24.7,
      locationLongitudeSnapshot: 46.6,
    })
  })

  it("rejects a site that belongs to another customer", async () => {
    const firstCustomerId = createId()
    const secondCustomerId = createId()
    const locationId = createId()
    await db.insert(schema.customers).values([
      { id: firstCustomerId, name: "First" },
      { id: secondCustomerId, name: "Second" },
    ])
    await db.insert(schema.customerLocations).values({
      id: locationId,
      customerId: secondCustomerId,
      name: "Wrong site",
      type: "office",
    })

    await expect(
      resolveCustomerLocationSnapshotCore(db, firstCustomerId, locationId)
    ).rejects.toThrow("Customer location does not belong to this customer")
  })
})
