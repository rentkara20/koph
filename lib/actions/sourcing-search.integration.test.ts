// Integration coverage for the sourcing searchable-picker data layer.
// Verifies the server-side search fixes the "first 100 preloaded records"
// limitation and that order search is always scoped to one customer.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { searchCustomersCore, getCustomerByIdCore } from "./customers"
import { searchCustomerOrdersCore, getOrderByIdCore } from "./orders"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

// Two customers, each with >100 orders, plus >100 customers total, so nothing
// under test can pass by accident within a 100-row preload window.
let customerA = ""
let customerB = ""
let deepCustomerId = "" // the 130th customer, unreachable by any 100-row preload
let deepOrderAId = "" // an order of A created after 100+ others

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sourcing-search-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })

  // 130 filler customers; the last one is our "deep" (>100) target.
  for (let i = 0; i < 130; i++) {
    const id = createId()
    await db.insert(schema.customers).values({ id, name: `Filler Customer ${i}` })
    if (i === 129) deepCustomerId = id
  }

  customerA = createId()
  customerB = createId()
  await db.insert(schema.customers).values({ id: customerA, name: "Alpha Industries" })
  await db.insert(schema.customers).values({ id: customerB, name: "Beta Corp" })
  // Give the deep customer a searchable, unique name.
  await db
    .update(schema.customers)
    .set({ name: "Zephyr Unreachable Ltd" })
    .where(eq(schema.customers.id, deepCustomerId))

  // 110 orders for A, 110 for B. The last A order is the "deep" order target.
  for (let i = 0; i < 110; i++) {
    const idA = createId()
    await db.insert(schema.orders).values({
      id: idA,
      orderNumber: `A-${String(i).padStart(4, "0")}`,
      customerId: customerA,
    })
    if (i === 109) deepOrderAId = idA

    await db.insert(schema.orders).values({
      id: createId(),
      orderNumber: `B-${String(i).padStart(4, "0")}`,
      customerId: customerB,
    })
  }
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("searchCustomersCore", () => {
  test("finds a customer beyond the first 100 records", async () => {
    const results = await searchCustomersCore(db, "Zephyr")
    expect(results.some((c) => c.id === deepCustomerId)).toBe(true)
  })

  test("returns a bounded result set", async () => {
    const results = await searchCustomersCore(db, undefined, 20)
    expect(results.length).toBeLessThanOrEqual(20)
  })

  test("empty query still returns a seed list", async () => {
    const results = await searchCustomersCore(db)
    expect(results.length).toBeGreaterThan(0)
  })

  test("no match returns empty array (not a crash)", async () => {
    const results = await searchCustomersCore(db, "no-such-customer-xyz")
    expect(results).toEqual([])
  })
})

describe("getCustomerByIdCore", () => {
  test("loads a customer directly by id even outside any search page", async () => {
    const c = await getCustomerByIdCore(db, deepCustomerId)
    expect(c?.name).toBe("Zephyr Unreachable Ltd")
  })

  test("unknown id → null", async () => {
    expect(await getCustomerByIdCore(db, "missing")).toBeNull()
  })
})

describe("searchCustomerOrdersCore", () => {
  test("finds an order beyond the first 100 for its customer", async () => {
    const results = await searchCustomerOrdersCore(db, customerA, "A-0109")
    expect(results.some((o) => o.id === deepOrderAId)).toBe(true)
  })

  test("is always scoped to the selected customer", async () => {
    const results = await searchCustomerOrdersCore(db, customerA)
    expect(results.every((o) => o.customerId === customerA)).toBe(true)
  })

  test("never returns another customer's orders", async () => {
    // Search A's list for a B order number — must not leak across customers.
    const results = await searchCustomerOrdersCore(db, customerA, "B-0001")
    expect(results).toEqual([])
  })

  test("no customer id → empty (picker disabled state)", async () => {
    expect(await searchCustomerOrdersCore(db, "")).toEqual([])
  })
})

describe("getOrderByIdCore", () => {
  test("loads a deep order by id (?orderId= preselection)", async () => {
    const o = await getOrderByIdCore(db, deepOrderAId)
    expect(o?.customerId).toBe(customerA)
    expect(o?.orderNumber).toBe("A-0109")
  })

  test("unknown id → null", async () => {
    expect(await getOrderByIdCore(db, "missing")).toBeNull()
  })
})
