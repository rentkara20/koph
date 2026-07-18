import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import {
  createCustomerLocationCore,
  replaceContactLocationLinksCore,
  setDefaultCustomerLocationCore,
} from "./customer-locations"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "customer-locations-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("customer locations", () => {
  it("makes the first customer location default and switches within that customer", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Acme" })

    const office = await db.transaction((tx) =>
      createCustomerLocationCore(tx, customerId, { name: "Main office", type: "office" })
    )
    const warehouse = await db.transaction((tx) =>
      createCustomerLocationCore(tx, customerId, { name: "Warehouse", type: "warehouse" })
    )

    let rows = await db
      .select()
      .from(schema.customerLocations)
      .where(eq(schema.customerLocations.customerId, customerId))
    expect(rows.find((row) => row.id === office.id)?.isDefault).toBe(true)
    expect(rows.find((row) => row.id === warehouse.id)?.isDefault).toBe(false)

    await db.transaction((tx) => setDefaultCustomerLocationCore(tx, customerId, warehouse.id))
    rows = await db
      .select()
      .from(schema.customerLocations)
      .where(eq(schema.customerLocations.customerId, customerId))
    expect(rows.filter((row) => row.isDefault)).toHaveLength(1)
    expect(rows.find((row) => row.id === warehouse.id)?.isDefault).toBe(true)
  })

  it("links one contact to several customer locations with one preferred site", async () => {
    const customerId = createId()
    const contactId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "Multi-site customer" })
    await db.insert(schema.customerContacts).values({ id: contactId, customerId, name: "Ahmed" })
    const office = await db.transaction((tx) =>
      createCustomerLocationCore(tx, customerId, { name: "Office", type: "office" })
    )
    const warehouse = await db.transaction((tx) =>
      createCustomerLocationCore(tx, customerId, { name: "Warehouse", type: "warehouse" })
    )

    await db.transaction((tx) =>
      replaceContactLocationLinksCore(tx, contactId, customerId, [office.id, warehouse.id], warehouse.id)
    )

    const links = await db
      .select()
      .from(schema.customerContactLocations)
      .where(eq(schema.customerContactLocations.contactId, contactId))
    expect(links).toHaveLength(2)
    expect(links.find((link) => link.locationId === warehouse.id)?.isPrimary).toBe(true)
    expect(links.filter((link) => link.isPrimary)).toHaveLength(1)
  })
})
