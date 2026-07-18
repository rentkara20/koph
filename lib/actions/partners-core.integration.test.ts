// Integration coverage for createPartnerCore / updatePartnerCore — the
// tx-scoped Core functions extracted from createPartner/updatePartner for
// the CSV Import/Export Center (lib/import-export/partner.ts).
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
import { createPartnerCore, updatePartnerCore } from "./partners"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "partners-core-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("createPartnerCore", () => {
  it("creates a partner with the given fields, defaulting status to active", async () => {
    let id = ""
    await db.transaction(async (tx) => {
      const result = await createPartnerCore(tx, { name: "Acme Logistics", mobile: "0501234567" }, null)
      id = result.id
    })

    const [row] = await db.select().from(schema.partners).where(eq(schema.partners.id, id))
    expect(row.name).toBe("Acme Logistics")
    expect(row.status).toBe("active")
  })

  it("throws when name is blank", async () => {
    await expect(
      db.transaction((tx) => createPartnerCore(tx, { name: "   " }, null))
    ).rejects.toThrow("Name is required")
  })
})

describe("updatePartnerCore", () => {
  it("updates an existing partner's fields", async () => {
    const id = createId()
    await db.insert(schema.partners).values({ id, name: "Old Name" })

    await db.transaction((tx) => updatePartnerCore(tx, id, { name: "New Name", status: "inactive" }))

    const [row] = await db.select().from(schema.partners).where(eq(schema.partners.id, id))
    expect(row.name).toBe("New Name")
    expect(row.status).toBe("inactive")
  })

  it("throws when name is blank", async () => {
    const id = createId()
    await db.insert(schema.partners).values({ id, name: "Has A Name" })

    await expect(db.transaction((tx) => updatePartnerCore(tx, id, { name: "" }))).rejects.toThrow(
      "Name is required"
    )
  })
})
