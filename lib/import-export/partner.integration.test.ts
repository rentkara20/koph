// Integration coverage for the Partner CSV import's validation/classification
// logic (lib/import-export/partner.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { validatePartnerRows } from "./partner"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "partner-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("validatePartnerRows", () => {
  it("classifies a row with no matching name as new", async () => {
    const rows = await validatePartnerRows(db, [
      { name: "Brand New Partner Co", contactPerson: "", mobile: "", email: "", city: "", notes: "", status: "" },
    ])
    expect(rows[0].classification).toBe("new")
  })

  it("classifies a row matching an existing partner by name (case-insensitive) as update", async () => {
    const id = createId()
    await db.insert(schema.partners).values({ id, name: "Acme Logistics" })

    const rows = await validatePartnerRows(db, [
      { name: "  acme logistics  ", contactPerson: "", mobile: "", email: "", city: "", notes: "", status: "" },
    ])
    expect(rows[0].classification).toBe("update")
    expect(rows[0].matchedId).toBe(id)
  })

  it("errors when name is missing", async () => {
    const rows = await validatePartnerRows(db, [
      { name: "", contactPerson: "", mobile: "", email: "", city: "", notes: "", status: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Name is required/)
  })

  it("errors when status is not a valid enum value", async () => {
    const rows = await validatePartnerRows(db, [
      { name: "Some Partner", contactPerson: "", mobile: "", email: "", city: "", notes: "", status: "suspended" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid status/)
  })
})
