import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { attributedToOrder, servingOrder } from "@/lib/db/asset-allocation-sql"
import { deriveOrderStatus } from "@/lib/utils/order-status"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "order-allocation-rollups-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function makeOrder(orderNumber: string) {
  const customerId = createId()
  const orderId = createId()
  const lineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId, status: "fulfilled" })
  await db.insert(schema.orderLines).values({
    id: lineId,
    orderId,
    type: "rental_asset",
    description: "Rented Laptop",
    quantity: 5,
  })
  return { orderId, lineId }
}

// An order that lent its devices out must not lose them from its own rollups.
// deriveOrderStatus returns "draft" for an empty unit list, so a rollup that
// filters on the current allocation alone would silently mark a delivered,
// collected, historical order as never started.
describe("order rollups when devices are on loan", () => {
  it("keeps a lent-out device attributed to the order that bought it", async () => {
    const lender = await makeOrder("60001")
    const borrower = await makeOrder("60002")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId: lender.orderId,
      orderLineId: lender.lineId,
      serialNumber: "LOAN-1",
      status: "delivered",
      kind: "rental",
      currentOrderId: borrower.orderId,
      currentOrderLineId: borrower.lineId,
    })

    const lenderUnits = await db.select().from(schema.orderUnits).where(attributedToOrder(lender.orderId))
    expect(lenderUnits.map((u) => u.id)).toContain(unitId)
    // And its status still derives to a fulfilled order, not a draft one.
    expect(deriveOrderStatus(lenderUnits.map((u) => u.status), "fulfilled")).toBe("fulfilled")

    const borrowerUnits = await db.select().from(schema.orderUnits).where(attributedToOrder(borrower.orderId))
    expect(borrowerUnits.map((u) => u.id)).toContain(unitId)
  })

  it("counts the device as out with the borrower's customer only", async () => {
    const lender = await makeOrder("60003")
    const borrower = await makeOrder("60004")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId: lender.orderId,
      orderLineId: lender.lineId,
      serialNumber: "LOAN-2",
      status: "delivered",
      kind: "rental",
      currentOrderId: borrower.orderId,
      currentOrderLineId: borrower.lineId,
    })

    // A collection receipt for the lender must NOT list a device that is
    // physically with somebody else's customer.
    const outForLender = await db.select().from(schema.orderUnits).where(servingOrder(lender.orderId))
    expect(outForLender.map((u) => u.id)).not.toContain(unitId)

    const outForBorrower = await db.select().from(schema.orderUnits).where(servingOrder(borrower.orderId))
    expect(outForBorrower.map((u) => u.id)).toContain(unitId)
  })

  it("attributes a device with no allocation to its origin order alone", async () => {
    const owner = await makeOrder("60005")
    const other = await makeOrder("60006")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId: owner.orderId,
      orderLineId: owner.lineId,
      serialNumber: "IDLE-1",
      status: "in_stock",
      kind: "rental",
    })

    const forOwner = await db.select().from(schema.orderUnits).where(servingOrder(owner.orderId))
    expect(forOwner.map((u) => u.id)).toContain(unitId)

    const forOther = await db.select().from(schema.orderUnits).where(attributedToOrder(other.orderId))
    expect(forOther.map((u) => u.id)).not.toContain(unitId)
  })
})

// The units editor (getOrder -> UnitsSection -> saveOrderUnits) may only show
// units sitting on a line of THIS order: saveOrderUnits rejects any unit whose
// line belongs elsewhere, so listing a borrowed device would make every save on
// the devices tab fail with "Invalid line reference".
describe("units editor scope", () => {
  it("lists only the order's own units, never borrowed ones", async () => {
    const owner = await makeOrder("60007")
    const borrower = await makeOrder("60008")
    const ownUnitId = createId()
    const borrowedUnitId = createId()
    await db.insert(schema.orderUnits).values([
      {
        id: ownUnitId,
        orderId: borrower.orderId,
        orderLineId: borrower.lineId,
        serialNumber: "OWN-1",
        status: "in_stock",
        kind: "rental",
      },
      {
        id: borrowedUnitId,
        orderId: owner.orderId,
        orderLineId: owner.lineId,
        serialNumber: "BORROWED-1",
        status: "in_stock",
        kind: "rental",
        currentOrderId: borrower.orderId,
        currentOrderLineId: borrower.lineId,
      },
    ])

    const editorUnits = await db
      .select()
      .from(schema.orderUnits)
      .where(eq(schema.orderUnits.orderId, borrower.orderId))

    expect(editorUnits.map((u) => u.id)).toContain(ownUnitId)
    expect(editorUnits.map((u) => u.id)).not.toContain(borrowedUnitId)
    // Every listed unit's line really belongs to the order being edited.
    const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, borrower.orderId))
    const lineIds = new Set(lines.map((l) => l.id))
    for (const u of editorUnits) expect(lineIds.has(u.orderLineId!)).toBe(true)
  })
})
