// Integration coverage for the Order CSV import's validation/classification
// logic (lib/import-export/order.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { validateOrderRows } from "./order"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "order-import-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("validateOrderRows", () => {
  it("classifies a row with a new orderNumber as new, resolving customer by id", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "IE Customer 1" })

    const rows = await validateOrderRows(db, [
      { orderNumber: "IE-001", customerId, customerName: "", contactPerson: "", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("new")
  })

  it("resolves the customer by exact customerName when customerId is omitted", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "IE Customer By Name" })

    const rows = await validateOrderRows(db, [
      { orderNumber: "IE-002", customerId: "", customerName: "IE Customer By Name", contactPerson: "", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("new")
    expect((rows[0].input as { customerId?: string })?.customerId).toBe(customerId)
  })

  it("classifies a row whose orderNumber matches an existing order as update and preserves its lines", async () => {
    const customerId = createId()
    const orderId = createId()
    const lineId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "IE Customer 3" })
    await db.insert(schema.orders).values({ id: orderId, orderNumber: "IE-003", customerId })
    await db.insert(schema.orderLines).values({ id: lineId, orderId, description: "Existing line", quantity: 2 })

    const rows = await validateOrderRows(db, [
      { orderNumber: "IE-003", customerId, customerName: "", contactPerson: "New contact", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("update")
    expect(rows[0].matchedId).toBe(orderId)
    const input = rows[0].input as { lines: { id: string }[] }
    expect(input.lines).toHaveLength(1)
    expect(input.lines[0].id).toBe(lineId)
  })

  it("errors when orderNumber is missing", async () => {
    const rows = await validateOrderRows(db, [
      { orderNumber: "", customerId: "x", customerName: "", contactPerson: "", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/orderNumber is required/)
  })

  it("errors when neither customerId nor customerName resolves to a real customer", async () => {
    const rows = await validateOrderRows(db, [
      { orderNumber: "IE-004", customerId: "does-not-exist", customerName: "", contactPerson: "", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
    ])
    expect(rows[0].classification).toBe("error")
    expect(rows[0].error).toMatch(/No customer with id/)
  })

  it("errors on a duplicate orderNumber within the same file", async () => {
    const customerId = createId()
    await db.insert(schema.customers).values({ id: customerId, name: "IE Customer 5" })
    const rows = await validateOrderRows(db, [
      { orderNumber: "IE-005", customerId, customerName: "", contactPerson: "", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
      { orderNumber: "IE-005", customerId, customerName: "", contactPerson: "", contactMobile: "", contactEmail: "", rentalPeriodMonths: "", additionalPeriodMonths: "", notes: "" },
    ])
    expect(rows[1].classification).toBe("error")
    expect(rows[1].error).toMatch(/Duplicate orderNumber/)
  })
})
