// Integration coverage for Sourcing V3 item #4: getProcurementCaseSourceRequests
// derives the covering sourcing requests from the evaluation chain, not the
// case's own (legacy, single) sourcingRequestId column — future-proofs the
// PO/case detail page for when award/case creation becomes cross-request too.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "procurement-case-source-requests-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedAwardedItem(requestId: string, evaluationId: string, supplierId: string) {
  const itemId = createId()
  await db.insert(schema.sourcingRequestItems).values({
    id: itemId,
    sourcingRequestId: requestId,
    quantity: 1,
    customerDescription: "Item",
    supplierDescription: "Item spec",
    status: "selected",
  })
  const rfqId = createId()
  await db.insert(schema.supplierRfqs).values({ id: rfqId, supplierId })
  const quotationId = createId()
  await db.insert(schema.supplierQuotations).values({ id: quotationId, rfqId })
  const quotationLineId = createId()
  await db.insert(schema.supplierQuotationLines).values({
    id: quotationLineId,
    quotationId,
    itemDescription: "Item spec",
    sourcingRequestItemId: itemId,
  })
  await db.insert(schema.commercialEvaluationLines).values({
    id: createId(),
    evaluationId,
    sourcingRequestItemId: itemId,
    chosenQuotationLineId: quotationLineId,
    reason: "lowest_price",
  })
}

describe("getProcurementCaseSourceRequests", () => {
  it("derives every distinct request covered by the case's awarded items", async () => {
    const { getProcurementCaseSourceRequestsCore } = await import("./procurement-case")

    const requestA = createId()
    const requestB = createId()
    await db.insert(schema.sourcingRequests).values([
      { id: requestA, sourceType: "customer_order", description: "req A", externalRef: "SO-A" },
      { id: requestB, sourceType: "customer_order", description: "req B", externalRef: "SO-B" },
    ])

    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Test Supplier" })

    const evaluationId = createId()
    await db.insert(schema.commercialEvaluations).values({
      id: evaluationId,
      sourcingRequestId: requestA, // legacy column, evaluation itself still request-scoped today
    })
    await seedAwardedItem(requestA, evaluationId, supplierId)
    await seedAwardedItem(requestB, evaluationId, supplierId) // simulates a future cross-request award

    const approvalId = createId()
    await db.insert(schema.commercialApprovals).values({
      id: approvalId,
      evaluationId,
      decision: "approved",
      approverId: (
        await db
          .insert(schema.users)
          .values({ id: createId(), email: `${createId()}@test.local`, name: "Approver" })
          .returning({ id: schema.users.id })
      )[0].id,
    })

    const caseId = createId()
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "commercial_flow",
      commercialApprovalId: approvalId,
    })

    const result = await getProcurementCaseSourceRequestsCore(db, caseId)
    expect(result.map((r) => r.externalRef).sort()).toEqual(["SO-A", "SO-B"])
  })

  it("falls back to the case's own sourcingRequestId for legacy/manual cases", async () => {
    const { getProcurementCaseSourceRequestsCore } = await import("./procurement-case")

    const requestId = createId()
    await db.insert(schema.sourcingRequests).values({
      id: requestId,
      sourceType: "operational_need",
      description: "legacy req",
      externalRef: "LEGACY-1",
    })
    const caseId = createId()
    await db.insert(schema.procurementCases).values({
      id: caseId,
      source: "system_manual",
      sourcingRequestId: requestId,
    })

    const result = await getProcurementCaseSourceRequestsCore(db, caseId)
    expect(result.map((r) => r.externalRef)).toEqual(["LEGACY-1"])
  })

  it("returns empty for a manual case with no linked request", async () => {
    const { getProcurementCaseSourceRequestsCore } = await import("./procurement-case")

    const caseId = createId()
    await db.insert(schema.procurementCases).values({ id: caseId, source: "system_manual" })

    const result = await getProcurementCaseSourceRequestsCore(db, caseId)
    expect(result).toEqual([])
  })
})
