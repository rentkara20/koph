// Integration coverage for createWarrantyProductCore / createWarrantyBatchCore
// — the tx-scoped Core functions extracted for the CSV Import/Export Center
// (lib/import-export/warranty-product.ts, lib/import-export/warranty-batch.ts).
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
import { createWarrantyBatchCore, createWarrantyProductCore } from "./warranty"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "warranty-core-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("createWarrantyProductCore", () => {
  it("creates a warranty product with the given fields", async () => {
    let id = ""
    await db.transaction(async (tx) => {
      const result = await createWarrantyProductCore(
        tx,
        { nameAr: "ضمان أبل", nameEn: "Apple Care", durationMonths: 12, providerName: "Apple" },
        null
      )
      id = result.id
    })

    const [row] = await db.select().from(schema.warrantyProducts).where(eq(schema.warrantyProducts.id, id))
    expect(row.nameEn).toBe("Apple Care")
    expect(row.durationMonths).toBe(12)
  })

  it("throws when durationMonths is not a positive integer", async () => {
    await expect(
      db.transaction((tx) =>
        createWarrantyProductCore(tx, { nameAr: "ضمان", nameEn: "Bad Product", durationMonths: 0 }, null)
      )
    ).rejects.toThrow()
  })
})

describe("createWarrantyBatchCore", () => {
  it("creates a batch with null purchaseOrderId/supplierId and does not touch unitsAssigned", async () => {
    const productId = createId()
    await db.insert(schema.warrantyProducts).values({
      id: productId,
      nameAr: "ضمان",
      nameEn: "Some Warranty",
      durationMonths: 12,
    })

    let id = ""
    await db.transaction(async (tx) => {
      const result = await createWarrantyBatchCore(
        tx,
        { warrantyProductId: productId, source: "bulk", unitsCovered: 5 },
        null
      )
      id = result.id
    })

    const [row] = await db.select().from(schema.warrantyBatches).where(eq(schema.warrantyBatches.id, id))
    expect(row.unitsCovered).toBe(5)
    expect(row.unitsAssigned).toBe(0)
    expect(row.purchaseOrderId).toBeNull()
    expect(row.supplierId).toBeNull()
  })

  it("throws when unitsCovered is not a positive integer", async () => {
    const productId = createId()
    await db.insert(schema.warrantyProducts).values({
      id: productId,
      nameAr: "ضمان",
      nameEn: "Another Warranty",
      durationMonths: 12,
    })

    await expect(
      db.transaction((tx) =>
        createWarrantyBatchCore(tx, { warrantyProductId: productId, source: "bulk", unitsCovered: 0 }, null)
      )
    ).rejects.toThrow()
  })
})
