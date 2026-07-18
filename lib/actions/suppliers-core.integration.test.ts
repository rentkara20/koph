// Integration coverage for createSupplierCore / updateSupplierCore — the
// tx-scoped Core functions extracted from createSupplier/updateSupplier for
// the CSV Import/Export Center (lib/import-export/supplier.ts).
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
import { createSupplierCore, updateSupplierCore } from "./suppliers"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "suppliers-core-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("createSupplierCore", () => {
  it("creates a supplier with the given fields", async () => {
    let id = ""
    await db.transaction(async (tx) => {
      const result = await createSupplierCore(tx, { name: "Acme Supplies", mobile: "0501234567" }, null)
      id = result.id
    })

    const [row] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id))
    expect(row.name).toBe("Acme Supplies")
    expect(row.mobile).toBe("0501234567")
    expect(row.createdBy).toBe(null)
  })

  it("throws when name is blank", async () => {
    await expect(
      db.transaction((tx) => createSupplierCore(tx, { name: "   " }, null))
    ).rejects.toThrow("Name is required")
  })
})

describe("updateSupplierCore", () => {
  it("updates an existing supplier's fields", async () => {
    const id = createId()
    await db.insert(schema.suppliers).values({ id, name: "Old Name" })

    await db.transaction((tx) => updateSupplierCore(tx, id, { name: "New Name", city: "Riyadh" }))

    const [row] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id))
    expect(row.name).toBe("New Name")
    expect(row.city).toBe("Riyadh")
  })

  it("throws when name is blank", async () => {
    const id = createId()
    await db.insert(schema.suppliers).values({ id, name: "Has A Name" })

    await expect(db.transaction((tx) => updateSupplierCore(tx, id, { name: "" }))).rejects.toThrow(
      "Name is required"
    )
  })
})
