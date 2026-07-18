// Integration coverage for the Warranty batch CSV import's
// validation/classification logic (lib/import-export/warranty-batch.ts).
// This module is create-only — there is no update path, and unitsAssigned is
// never set from CSV.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { validateWarrantyBatchRows } from "./warranty-batch"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warranty-batch-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })

  await db.insert(schema.warrantyProducts).values({
    id: "wp1",
    nameAr: "ضمان أبل",
    nameEn: "Apple Care",
    durationMonths: 12,
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("validateWarrantyBatchRows", () => {
  it("classifies a row with a valid product name and no matching invoiceRef as new", async () => {
    const rows = await validateWarrantyBatchRows(db, [
      { warrantyProductName: "Apple Care", source: "bulk", invoiceRef: "INV-100", unitsCovered: "5" },
    ])
    expect(rows[0].classification).toBe("new")
    expect(rows[0].input).toMatchObject({
      warrantyProductId: "wp1",
      source: "bulk",
      invoiceRef: "INV-100",
      unitsCovered: 5,
    })
  })

  it("errors when warrantyProductName does not match any product", async () => {
    const rows = await validateWarrantyBatchRows(db, [
      { warrantyProductName: "Nonexistent Product", source: "bulk", invoiceRef: "", unitsCovered: "3" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/No warranty product found/)
  })

  it("errors when source is not a valid enum value", async () => {
    const rows = await validateWarrantyBatchRows(db, [
      { warrantyProductName: "Apple Care", source: "unknown_source", invoiceRef: "", unitsCovered: "3" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid source/)
  })

  it("errors when unitsCovered is not a positive integer", async () => {
    const rows = await validateWarrantyBatchRows(db, [
      { warrantyProductName: "Apple Care", source: "bulk", invoiceRef: "", unitsCovered: "0" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid unitsCovered/)
  })

  it("errors when warrantyProductName+invoiceRef matches an existing batch (create-only, no update)", async () => {
    await db.insert(schema.warrantyBatches).values({
      id: "wb1",
      warrantyProductId: "wp1",
      source: "bulk",
      invoiceRef: "INV-EXISTING",
      unitsCovered: 10,
    })

    const rows = await validateWarrantyBatchRows(db, [
      { warrantyProductName: "Apple Care", source: "bulk", invoiceRef: "INV-EXISTING", unitsCovered: "2" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/cannot be edited via CSV import/)
  })
})
