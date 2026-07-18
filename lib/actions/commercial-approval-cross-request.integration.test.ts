// Sourcing V3: coverage for the award/approve/handoff chain now being
// item-based instead of single-request-scoped — two different customer
// requests' items, awarded to the same supplier in one submission, must
// collapse into ONE evaluation and ONE procurement case (the original
// N-PO-per-supplier gap, closed end to end). Same mock pattern as
// delivery-allocation.integration.test.ts.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

const ADMIN_ID = "admin-user-cross-request-itest"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => ({ user: { id: ADMIN_ID } })),
  getStaffSession: vi.fn(async () => ({ user: { id: ADMIN_ID } })),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { awardSourcingItems, decideCommercialApproval, handoffToProcurementCase } from "./commercial-approval"
import { getProcurementCaseSourceRequestsCore } from "./procurement-case"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "commercial-approval-cross-request-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({ id: ADMIN_ID, name: "Admin", email: "admin@cross-request-itest.local", role: "admin" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedQuotedItem(requestId: string, supplierId: string) {
  const itemId = createId()
  await db.insert(schema.sourcingRequestItems).values({
    id: itemId,
    sourcingRequestId: requestId,
    quantity: 1,
    customerDescription: "Item",
    supplierDescription: "Item spec",
    status: "quoted",
  })
  const rfqId = createId()
  await db.insert(schema.supplierRfqs).values({ id: rfqId, supplierId }) // consolidated: no sourcingRequestId
  await db.insert(schema.supplierRfqItems).values({ id: createId(), rfqId, sourcingRequestItemId: itemId })
  const quotationId = createId()
  await db.insert(schema.supplierQuotations).values({ id: quotationId, rfqId })
  const quotationLineId = createId()
  await db.insert(schema.supplierQuotationLines).values({
    id: quotationLineId,
    quotationId,
    itemDescription: "Item spec",
    unitPrice: 100,
    sourcingRequestItemId: itemId,
  })
  return { itemId, quotationLineId }
}

describe("cross-request award -> approve -> handoff", () => {
  test("two different customer requests awarded to the same supplier collapse into one evaluation and one procurement case", async () => {
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Gulf IT Distribution" })

    const requestA = createId()
    const requestB = createId()
    await db.insert(schema.sourcingRequests).values([
      { id: requestA, sourceType: "customer_order", description: "Customer A", externalRef: "SO-A", status: "quotes_received" },
      { id: requestB, sourceType: "customer_order", description: "Customer B", externalRef: "SO-B", status: "quotes_received" },
    ])

    const a = await seedQuotedItem(requestA, supplierId)
    const b = await seedQuotedItem(requestB, supplierId)

    const awardResult = await awardSourcingItems({
      awards: [
        { sourcingRequestItemId: a.itemId, quotationLineId: a.quotationLineId, reason: "lowest_price" },
        { sourcingRequestItemId: b.itemId, quotationLineId: b.quotationLineId, reason: "lowest_price" },
      ],
    })
    expect(awardResult.error).toBeUndefined()
    const evaluationId = awardResult.id as string

    const [evaluation] = await db
      .select()
      .from(schema.commercialEvaluations)
      .where(eq(schema.commercialEvaluations.id, evaluationId))
    expect(evaluation.sourcingRequestId).toBeNull() // spans 2 requests, legacy column stays null

    const [itemAAfterAward] = await db
      .select()
      .from(schema.sourcingRequestItems)
      .where(eq(schema.sourcingRequestItems.id, a.itemId))
    expect(itemAAfterAward.status).toBe("selected")

    const [requestAAfterAward] = await db.select().from(schema.sourcingRequests).where(eq(schema.sourcingRequests.id, requestA))
    expect(requestAAfterAward.status).toBe("under_evaluation")

    const approveResult = await decideCommercialApproval({ evaluationId, decision: "approved" })
    expect(approveResult.error).toBeUndefined()

    const [requestBAfterApproval] = await db.select().from(schema.sourcingRequests).where(eq(schema.sourcingRequests.id, requestB))
    expect(requestBAfterApproval.status).toBe("approved")

    const handoffResult = await handoffToProcurementCase({ evaluationId })
    expect(handoffResult.error).toBeUndefined()
    const caseId = handoffResult.id as string

    const [procurementCase] = await db
      .select()
      .from(schema.procurementCases)
      .where(eq(schema.procurementCases.id, caseId))
    expect(procurementCase.sourcingRequestId).toBeNull() // spans 2 requests
    expect(procurementCase.supplierId).toBe(supplierId)

    // Only ONE case was created for the shared supplier (not one per request).
    const casesForApproval = await db
      .select()
      .from(schema.procurementCases)
      .where(eq(schema.procurementCases.commercialApprovalId, procurementCase.commercialApprovalId as string))
    expect(casesForApproval).toHaveLength(1)

    const [requestAAfterHandoff] = await db.select().from(schema.sourcingRequests).where(eq(schema.sourcingRequests.id, requestA))
    const [requestBAfterHandoff] = await db.select().from(schema.sourcingRequests).where(eq(schema.sourcingRequests.id, requestB))
    expect(requestAAfterHandoff.status).toBe("handed_off")
    expect(requestBAfterHandoff.status).toBe("handed_off")

    // P3 traceability now actually surfaces both requests for this case.
    const sourceRequests = await getProcurementCaseSourceRequestsCore(db, caseId)
    expect(sourceRequests.map((r) => r.externalRef).sort()).toEqual(["SO-A", "SO-B"])
  })

  test("re-awarding an item locked under an approved evaluation is rejected even from a different request's submission", async () => {
    const supplierId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Locked Supplier Co" })
    const requestId = createId()
    await db.insert(schema.sourcingRequests).values({
      id: requestId,
      sourceType: "customer_order",
      description: "Locked request",
      status: "quotes_received",
    })
    const item = await seedQuotedItem(requestId, supplierId)

    const awardResult = await awardSourcingItems({
      awards: [{ sourcingRequestItemId: item.itemId, quotationLineId: item.quotationLineId, reason: "manual" }],
    })
    const evaluationId = awardResult.id as string
    await decideCommercialApproval({ evaluationId, decision: "approved" })

    const secondQuotationLineId = createId()
    const [quotationLine] = await db
      .select()
      .from(schema.supplierQuotationLines)
      .where(eq(schema.supplierQuotationLines.id, item.quotationLineId))
    await db.insert(schema.supplierQuotationLines).values({
      id: secondQuotationLineId,
      quotationId: quotationLine.quotationId,
      itemDescription: "Item spec",
      unitPrice: 90,
      sourcingRequestItemId: item.itemId,
    })

    const retryResult = await awardSourcingItems({
      awards: [{ sourcingRequestItemId: item.itemId, quotationLineId: secondQuotationLineId, reason: "lowest_price" }],
    })
    expect(retryResult.error).toMatch(/locked/i)
  })
})
