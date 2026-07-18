// Integration coverage for the Customer CSV import's validation/classification
// logic (lib/import-export/customer.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { validateCustomerRows } from "./customer"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "customer-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("validateCustomerRows", () => {
  it("classifies a row with no matching id or natural key as new", async () => {
    const rows = await validateCustomerRows(db, [
      { id: "", name: "Brand New Co", contactPerson: "", mobile: "0501111111", email: "", city: "", address: "", mapsLink: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("new")
  })

  it("classifies a row matching an existing id as update", async () => {
    const id = createId()
    await db.insert(schema.customers).values({ id, name: "Acme", mobile: "0502222222" })

    const rows = await validateCustomerRows(db, [
      { id, name: "Acme Renamed", contactPerson: "", mobile: "0502222222", email: "", city: "", address: "", mapsLink: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("update")
    expect(rows[0].matchedId).toBe(id)
  })

  it("classifies a row matching by natural key (name+mobile) as update when no id is given", async () => {
    const id = createId()
    await db.insert(schema.customers).values({ id, name: "Globex", mobile: "0503333333" })

    const rows = await validateCustomerRows(db, [
      { id: "", name: "Globex", contactPerson: "", mobile: "0503333333", email: "", city: "", address: "", mapsLink: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("update")
    expect(rows[0].matchedId).toBe(id)
  })

  it("errors when name is missing", async () => {
    const rows = await validateCustomerRows(db, [
      { id: "", name: "", contactPerson: "", mobile: "", email: "", city: "", address: "", mapsLink: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Name is required/)
  })

  it("errors when an explicit id does not match any existing customer", async () => {
    const rows = await validateCustomerRows(db, [
      { id: "not-a-real-id", name: "Someone", contactPerson: "", mobile: "", email: "", city: "", address: "", mapsLink: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/No existing customer/)
  })
})
