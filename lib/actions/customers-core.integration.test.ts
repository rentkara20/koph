// Integration coverage for createCustomerCore / updateCustomerCore — the
// tx-scoped Core functions extracted from createCustomer/updateCustomer for
// the CSV Import/Export Center (lib/import-export/customer.ts).
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
import { createCustomerCore, updateCustomerCore } from "./customers"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "customers-core-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("createCustomerCore", () => {
  it("creates a customer with the given fields", async () => {
    let id = ""
    await db.transaction(async (tx) => {
      const result = await createCustomerCore(tx, { name: "Acme Corp", mobile: "0501234567" }, null)
      id = result.id
    })

    const [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, id))
    expect(row.name).toBe("Acme Corp")
    expect(row.mobile).toBe("0501234567")
    expect(row.createdBy).toBe(null)
  })

  it("throws when name is blank", async () => {
    await expect(
      db.transaction((tx) => createCustomerCore(tx, { name: "   " }, null))
    ).rejects.toThrow("Name is required")
  })
})

describe("updateCustomerCore", () => {
  it("updates an existing customer's fields", async () => {
    const id = createId()
    await db.insert(schema.customers).values({ id, name: "Old Name" })

    await db.transaction((tx) => updateCustomerCore(tx, id, { name: "New Name", city: "Riyadh" }))

    const [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, id))
    expect(row.name).toBe("New Name")
    expect(row.city).toBe("Riyadh")
  })

  it("throws when name is blank", async () => {
    const id = createId()
    await db.insert(schema.customers).values({ id, name: "Has A Name" })

    await expect(db.transaction((tx) => updateCustomerCore(tx, id, { name: "" }))).rejects.toThrow(
      "Name is required"
    )
  })
})
