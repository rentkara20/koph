// Integration coverage for the Asset CSV import's validation/classification
// logic (lib/import-export/asset.ts) — new vs. update vs. error rows against
// real DB state, using an ephemeral SQLite db (same pattern as
// lib/actions/customer-locations.integration.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { validateAssetRows } from "./asset"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "asset-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// order_unit has a CHECK constraint requiring exactly one origin (order line
// or PO line) unless created standalone via createAssetCore — so seeding a
// pre-existing asset for these tests goes through a real order line rather
// than a bare insert.
async function seedExistingAsset(assetTag: string) {
  const customerId = createId()
  const orderId = createId()
  const lineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Seed ${assetTag}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber: `SEED-${assetTag}`, customerId })
  await db.insert(schema.orderLines).values({ id: lineId, orderId, description: "Seed device", quantity: 1 })
  await db.insert(schema.orderUnits).values({
    id: createId(),
    orderLineId: lineId,
    orderId,
    assetTag,
    status: "in_stock",
    kind: "rental",
  })
}

describe("validateAssetRows", () => {
  it("classifies a row with no matching assetTag as new", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-NEW-1", serialNumber: "SN-NEW-1", kind: "rental", status: "", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].classification).toBe("new")
    expect(rows[0].input).toMatchObject({ serialNumber: "SN-NEW-1", standalone: true })
  })

  it("errors a new row missing assetTag (required — the natural key)", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "", serialNumber: "SN-NEW-2", kind: "rental", status: "", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/assetTag is required/)
  })

  it("classifies a row whose assetTag matches an existing asset as update", async () => {
    await seedExistingAsset("KARA-EXIST-1")

    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-EXIST-1", serialNumber: "", kind: "", status: "", location: "main_warehouse", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "updated note" },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].classification).toBe("update")
    expect(rows[0].input).toMatchObject({ notes: "updated note" })
  })

  it("errors a row with an invalid kind", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "", serialNumber: "", kind: "not-a-kind", status: "", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid kind/)
  })

  it("errors a new-row status that is not in_stock (status is a guarded transition, not CSV-settable)", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-NEW-STATUS-1", serialNumber: "", kind: "", status: "delivered", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/in_stock/)
  })

  it("errors an existing row that requests a different status than it currently has", async () => {
    await seedExistingAsset("KARA-EXIST-2")
    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-EXIST-2", serialNumber: "", kind: "", status: "retired", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Status changes are not supported/)
  })

  it("errors on a duplicate serial number within the same file", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-DUP-1", serialNumber: "SN-DUP", kind: "", status: "", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
      { assetTag: "KARA-DUP-2", serialNumber: "SN-DUP", kind: "", status: "", location: "", purchaseCost: "", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("new")
    expect(rows[1].classification).toBe("error")
    expect(rows[1].error).toMatch(/Duplicate serial number/)
  })

  it("errors on an invalid purchaseDate format", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "", serialNumber: "", kind: "", status: "", location: "", purchaseCost: "", purchaseDate: "not-a-date", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid purchaseDate/)
  })

  it("captures device identity + cost/procurement fields on a new row", async () => {
    const rows = await validateAssetRows(db, [
      {
        assetTag: "KARA-DEV-1",
        serialNumber: "SN-DEV-1",
        brand: "Dell",
        model: "Latitude 5540",
        deviceType: "Laptop",
        kind: "rental",
        status: "",
        location: "",
        purchaseCost: "1000",
        warrantyCost: "150",
        purchaseDate: "",
        warrantyEnd: "",
        invoiceNo: "INV-2026-001",
        sourceOrderNo: "PO-88",
        notes: "",
      },
    ])
    expect(rows[0].classification).toBe("new")
    expect(rows[0].input).toMatchObject({
      brand: "Dell",
      model: "Latitude 5540",
      deviceType: "Laptop",
      purchaseCost: 1000,
      warrantyCost: 150,
      invoiceNo: "INV-2026-001",
      sourceOrderNo: "PO-88",
    })
  })

  it("errors on an invalid warrantyCost", async () => {
    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-WC-1", serialNumber: "", kind: "", status: "", location: "", purchaseCost: "", warrantyCost: "abc", purchaseDate: "", warrantyEnd: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/Invalid warrantyCost/)
  })

  it("back-fills device identity onto an existing asset via update", async () => {
    await seedExistingAsset("KARA-EXIST-DEV")
    const rows = await validateAssetRows(db, [
      { assetTag: "KARA-EXIST-DEV", serialNumber: "", brand: "HP", model: "EliteBook 840", deviceType: "Laptop", kind: "", status: "", location: "", purchaseCost: "", warrantyCost: "", purchaseDate: "", warrantyEnd: "", invoiceNo: "", sourceOrderNo: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("update")
    expect(rows[0].input).toMatchObject({ brand: "HP", model: "EliteBook 840", deviceType: "Laptop" })
  })
})
