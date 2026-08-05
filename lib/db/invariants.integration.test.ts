import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { eq } from "drizzle-orm"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { findAssetKindLineTypeMismatches } from "@/lib/db/invariants"
import { createAssetCore } from "@/lib/actions/assets"

// Regression gate for the order-10692 class of defect: a unit whose kind
// contradicts its own order line. The failure mode is silent — no throw, no
// 500, just a device that can no longer be collected back from the customer —
// so the only thing that catches it is an explicit invariant.

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "invariants-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedLine(orderNumber: string, type: "rental_asset" | "sold_product") {
  const customerId = createId()
  const orderId = createId()
  const orderLineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId })
  await db.insert(schema.orderLines).values({
    id: orderLineId,
    orderId,
    description: "iPad A16",
    quantity: 1,
    type,
  })
  return { orderId, orderLineId }
}

describe("findAssetKindLineTypeMismatches", () => {
  it("reports nothing for units minted through createAssetCore on either line type", async () => {
    const rental = await seedLine("60001", "rental_asset")
    const sale = await seedLine("60002", "sold_product")

    await db.transaction(async (tx) => {
      await createAssetCore(tx, { orderLineId: rental.orderLineId, serialNumber: "INV-R1" }, null)
      await createAssetCore(tx, { orderLineId: sale.orderLineId, serialNumber: "INV-S1" }, null)
    })

    expect(await findAssetKindLineTypeMismatches(db)).toEqual([])
  })

  it("catches a rental-line unit stamped sale, the way the repair script left order 10692", async () => {
    const { orderLineId } = await seedLine("60003", "rental_asset")
    let assetId = ""
    await db.transaction(async (tx) => {
      const r = await createAssetCore(tx, { orderLineId, serialNumber: "INV-R2" }, null)
      assetId = r.assetId
    })

    // Corrupt it exactly as the out-of-band script did: widen kind to unlock a
    // transition, leave the line alone.
    await db.update(schema.orderUnits).set({ kind: "sale" }).where(eq(schema.orderUnits.id, assetId))

    const found = await findAssetKindLineTypeMismatches(db)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: assetId, kind: "sale", lineType: "rental_asset" })

    await db.update(schema.orderUnits).set({ kind: "rental" }).where(eq(schema.orderUnits.id, assetId))
    expect(await findAssetKindLineTypeMismatches(db)).toEqual([])
  })

  it("catches the mirror case — a sold_product unit stamped rental", async () => {
    const { orderLineId } = await seedLine("60004", "sold_product")
    let assetId = ""
    await db.transaction(async (tx) => {
      const r = await createAssetCore(tx, { orderLineId, serialNumber: "INV-S2" }, null)
      assetId = r.assetId
    })

    await db.update(schema.orderUnits).set({ kind: "rental" }).where(eq(schema.orderUnits.id, assetId))
    expect(await findAssetKindLineTypeMismatches(db)).toHaveLength(1)

    await db.update(schema.orderUnits).set({ kind: "sale" }).where(eq(schema.orderUnits.id, assetId))
    expect(await findAssetKindLineTypeMismatches(db)).toEqual([])
  })

  it("ignores units with no order-line origin — nothing to contradict", async () => {
    await db.insert(schema.orderUnits).values({
      id: createId(),
      serialNumber: "INV-STANDALONE",
      assetTag: "KARA-99001",
      kind: "sale",
      status: "in_stock",
    })

    expect(await findAssetKindLineTypeMismatches(db)).toEqual([])
  })
})
