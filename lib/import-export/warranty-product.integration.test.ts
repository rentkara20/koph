// Integration coverage for the Warranty product CSV import's
// validation/classification logic (lib/import-export/warranty-product.ts).
// This module is create-only — there is no update path.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { validateWarrantyProductRows } from "./warranty-product"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warranty-product-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("validateWarrantyProductRows", () => {
  it("classifies a row with no matching nameEn as new", async () => {
    const rows = await validateWarrantyProductRows(db, [
      { nameAr: "ضمان أبل", nameEn: "Apple Care", durationMonths: "12", providerName: "Apple" },
    ])
    expect(rows[0].classification).toBe("new")
    expect(rows[0].input).toEqual({
      nameAr: "ضمان أبل",
      nameEn: "Apple Care",
      durationMonths: 12,
      providerName: "Apple",
    })
  })

  it("errors when nameEn matches an existing product (create-only, no update)", async () => {
    await db.insert(schema.warrantyProducts).values({
      id: "wp1",
      nameAr: "ضمان لينوفو",
      nameEn: "Lenovo Care",
      durationMonths: 24,
    })

    const rows = await validateWarrantyProductRows(db, [
      { nameAr: "ضمان لينوفو محدث", nameEn: "  lenovo care  ", durationMonths: "24", providerName: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/not supported/)
  })

  it("errors when durationMonths is not a positive integer", async () => {
    const rows = await validateWarrantyProductRows(db, [
      { nameAr: "ضمان", nameEn: "Some Warranty", durationMonths: "0", providerName: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid durationMonths/)
  })

  it("errors on duplicate nameEn within the same file", async () => {
    const rows = await validateWarrantyProductRows(db, [
      { nameAr: "أ", nameEn: "Dup Name", durationMonths: "12", providerName: "" },
      { nameAr: "ب", nameEn: "Dup Name", durationMonths: "12", providerName: "" },
    ])
    expect(rows[0].classification).toBe("new")
    expect(rows[1].classification).toBe("error")
    expect(rows[1].error).toMatch(/Duplicate nameEn/)
  })
})
