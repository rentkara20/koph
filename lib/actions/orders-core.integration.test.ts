// Integration coverage for createOrderCore / updateOrderCore — the tx-scoped
// Core functions extracted from createOrder/updateOrder for the CSV
// Import/Export Center (lib/import-export/order.ts).
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
import { createOrderCore, updateOrderCore } from "./orders"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "orders-core-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedCustomer(name: string) {
  const id = createId()
  await db.insert(schema.customers).values({ id, name })
  return id
}

describe("createOrderCore", () => {
  it("creates an order header with no lines", async () => {
    const customerId = await seedCustomer("Core Test Customer 1")

    let id = ""
    await db.transaction(async (tx) => {
      const result = await createOrderCore(
        tx,
        { orderNumber: "OC-001", customerId, lines: [] },
        null
      )
      id = result.id
    })

    const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, id))
    expect(row.orderNumber).toBe("OC-001")
    expect(row.customerId).toBe(customerId)
    expect(row.createdBy).toBe(null)
  })

  it("throws when the order number already exists", async () => {
    const customerId = await seedCustomer("Core Test Customer 2")
    await db.transaction((tx) => createOrderCore(tx, { orderNumber: "OC-DUPE", customerId, lines: [] }, null))

    await expect(
      db.transaction((tx) => createOrderCore(tx, { orderNumber: "OC-DUPE", customerId, lines: [] }, null))
    ).rejects.toThrow("Order number already exists")
  })
})

describe("updateOrderCore", () => {
  it("updates the order header and reconciles lines", async () => {
    const customerId = await seedCustomer("Core Test Customer 3")
    let orderId = ""
    await db.transaction(async (tx) => {
      const result = await createOrderCore(
        tx,
        {
          orderNumber: "OC-002",
          customerId,
          lines: [{ type: "rental_asset", description: "Laptop", quantity: 1 }],
        },
        null
      )
      orderId = result.id
    })

    const [existingLine] = await db
      .select()
      .from(schema.orderLines)
      .where(eq(schema.orderLines.orderId, orderId))

    await db.transaction((tx) =>
      updateOrderCore(tx, orderId, {
        orderNumber: "OC-002",
        customerId,
        notes: "Updated via core",
        lines: [{ id: existingLine.id, type: "rental_asset", description: "Laptop", quantity: 2 }],
      })
    )

    const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId))
    expect(row.notes).toBe("Updated via core")
    const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(2)
  })

  it("throws when the new order number collides with a different order", async () => {
    const customerId = await seedCustomer("Core Test Customer 4")
    let orderAId = ""
    await db.transaction(async (tx) => {
      const result = await createOrderCore(tx, { orderNumber: "OC-A", customerId, lines: [] }, null)
      orderAId = result.id
    })
    await db.transaction((tx) => createOrderCore(tx, { orderNumber: "OC-B", customerId, lines: [] }, null))

    await expect(
      db.transaction((tx) => updateOrderCore(tx, orderAId, { orderNumber: "OC-B", customerId, lines: [] }))
    ).rejects.toThrow("Order number already exists")
  })
})
