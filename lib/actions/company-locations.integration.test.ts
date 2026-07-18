import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { asc } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import {
  createCompanyLocationCore,
  setDefaultCompanyLocationCore,
} from "./company-locations"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "company-locations-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("company locations", () => {
  it("makes the first location default and switches the default atomically", async () => {
    const first = await db.transaction((tx) =>
      createCompanyLocationCore(tx, {
        companyName: "KARA",
        name: "Riyadh main warehouse",
        type: "warehouse",
        contactName: "Mohammed",
        contactMobile: "0500000000",
        address: "Olaya, Riyadh",
        mapsLink: "https://maps.example/riyadh",
      })
    )
    const second = await db.transaction((tx) =>
      createCompanyLocationCore(tx, {
        companyName: "KARA",
        name: "Jeddah warehouse",
        type: "warehouse",
      })
    )

    let rows = await db.select().from(schema.companyLocations).orderBy(asc(schema.companyLocations.createdAt))
    expect(rows.find((row) => row.id === first.id)?.isDefault).toBe(true)
    expect(rows.find((row) => row.id === second.id)?.isDefault).toBe(false)

    await db.transaction((tx) => setDefaultCompanyLocationCore(tx, second.id))

    rows = await db.select().from(schema.companyLocations).orderBy(asc(schema.companyLocations.createdAt))
    expect(rows.filter((row) => row.isDefault)).toHaveLength(1)
    expect(rows.find((row) => row.id === second.id)?.isDefault).toBe(true)
  })
})
