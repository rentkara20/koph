// Integration coverage for Sourcing V3: sendConsolidatedSupplierRfqCore —
// one RFQ carrying items from multiple different sourcing requests (the
// N-PO-per-supplier gap fix). See project_koph_sourcing_v3_consolidation
// memory for the full design.
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
import { sendConsolidatedSupplierRfqCore } from "./sourcing-consolidated"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sourcing-consolidated-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedRequestWithItem(status: "draft" | "rfq_sent" | "cancelled" = "draft") {
  const requestId = createId()
  const itemId = createId()
  await db.insert(schema.sourcingRequests).values({
    id: requestId,
    sourceType: "operational_need",
    description: "test request",
    status,
  })
  await db.insert(schema.sourcingRequestItems).values({
    id: itemId,
    sourcingRequestId: requestId,
    quantity: 1,
    customerDescription: "Item",
    supplierDescription: "Item spec",
  })
  return { requestId, itemId }
}

describe("sendConsolidatedSupplierRfqCore", () => {
  it("creates one RFQ carrying items from two different requests, request-agnostic", async () => {
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Gulf IT Distribution" })
    const a = await seedRequestWithItem("draft")
    const b = await seedRequestWithItem("draft")

    const result = await db.transaction((tx) =>
      sendConsolidatedSupplierRfqCore(tx, { supplierId, itemIds: [a.itemId, b.itemId] }, "u1")
    )

    expect(result.affectedRequestIds.sort()).toEqual([a.requestId, b.requestId].sort())

    const [rfq] = await db.select().from(schema.supplierRfqs).where(eq(schema.supplierRfqs.id, result.rfqId))
    expect(rfq.sourcingRequestId).toBeNull()
    expect(rfq.supplierId).toBe(supplierId)

    const rfqItems = await db
      .select()
      .from(schema.supplierRfqItems)
      .where(eq(schema.supplierRfqItems.rfqId, result.rfqId))
    expect(rfqItems.map((r) => r.sourcingRequestItemId).sort()).toEqual([a.itemId, b.itemId].sort())

    const items = await db
      .select()
      .from(schema.sourcingRequestItems)
      .where(eq(schema.sourcingRequestItems.id, a.itemId))
    expect(items[0].status).toBe("rfq_sent")

    const requests = await db
      .select()
      .from(schema.sourcingRequests)
      .where(eq(schema.sourcingRequests.id, a.requestId))
    expect(requests[0].status).toBe("rfq_sent")
  })

  it("rejects when an item belongs to a cancelled request", async () => {
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Rejected Supplier Co" })
    const cancelled = await seedRequestWithItem("cancelled")

    await expect(
      db.transaction((tx) =>
        sendConsolidatedSupplierRfqCore(tx, { supplierId, itemIds: [cancelled.itemId] }, "u1")
      )
    ).rejects.toThrow(/closed request/)
  })

  it("rejects unknown items", async () => {
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Unknown Item Supplier" })

    await expect(
      db.transaction((tx) =>
        sendConsolidatedSupplierRfqCore(tx, { supplierId, itemIds: [createId()] }, "u1")
      )
    ).rejects.toThrow(/not found/)
  })
})
