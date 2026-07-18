// Integration coverage for the Supplier CSV import's validation/classification
// logic (lib/import-export/supplier.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { validateSupplierRows } from "./supplier"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "supplier-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("validateSupplierRows", () => {
  it("classifies a row with no matching name as new", async () => {
    const rows = await validateSupplierRows(db, [
      { name: "Brand New Supplier Co", contactPerson: "", mobile: "", email: "", city: "", address: "", notes: "", pickupContactName: "", pickupContactMobile: "", pickupNotes: "" },
    ])
    expect(rows[0].classification).toBe("new")
  })

  it("classifies a row matching an existing supplier by name (case-insensitive) as update", async () => {
    const id = createId()
    await db.insert(schema.suppliers).values({ id, name: "Acme Supplies" })

    const rows = await validateSupplierRows(db, [
      { name: "  acme supplies  ", contactPerson: "", mobile: "", email: "", city: "", address: "", notes: "", pickupContactName: "", pickupContactMobile: "", pickupNotes: "" },
    ])
    expect(rows[0].classification).toBe("update")
    expect(rows[0].matchedId).toBe(id)
  })

  it("errors when name is missing", async () => {
    const rows = await validateSupplierRows(db, [
      { name: "", contactPerson: "", mobile: "", email: "", city: "", address: "", notes: "", pickupContactName: "", pickupContactMobile: "", pickupNotes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Name is required/)
  })
})
