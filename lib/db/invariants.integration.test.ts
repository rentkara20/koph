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
import {
  findAssetKindLineTypeMismatches,
  findClosedTasksWithoutPayment,
} from "@/lib/db/invariants"
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

// The money-losing sibling of the kind/line-type defect: a closed trip that
// owes the partner nothing. Sign-off writes the decision and the payment row
// together, but the payment side needs a contract to price against — so with no
// contract the task closes, the decision lands, and the payment never exists.
// Nothing errors, which is precisely why this needs a check rather than a page.
describe("findClosedTasksWithoutPayment", () => {
  let partnerId: string
  let purchaseOrderId: string

  beforeAll(async () => {
    partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Fahad Logistics" })

    // A supplier_pickup task is rejected by partner_task_single_origin_chk
    // unless it carries a purchase order, so the exclusion case needs a real
    // procurement chain behind it rather than a bare kind flag.
    const supplierId = createId()
    const caseId = createId()
    purchaseOrderId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "Gulf IT Distribution" })
    await db.insert(schema.procurementCases).values({ id: caseId, source: "system_manual" })
    await db.insert(schema.purchaseOrders).values({
      id: purchaseOrderId,
      supplierId,
      poNumber: "PO-INV-1",
      procurementCaseId: caseId,
    })
  })

  let tokenCounter = 0
  async function seedTask(input: {
    status: (typeof schema.partnerTasks.$inferInsert)["status"]
    kind?: (typeof schema.partnerTasks.$inferInsert)["kind"]
    payment?: boolean
    decision?: "full" | "partial" | "none" | "hold"
  }) {
    const id = createId()
    tokenCounter += 1
    const kind = input.kind ?? "ad_hoc"
    await db.insert(schema.partnerTasks).values({
      id,
      partnerId,
      kind,
      purchaseOrderId: kind === "supplier_pickup" ? purchaseOrderId : null,
      taskToken: `inv-token-${tokenCounter}`,
      taskTokenExpiresAt: Date.now() + 86_400_000,
      status: input.status,
      closedAt: input.status === "closed" ? Date.now() : null,
    })
    if (input.payment) {
      await db.insert(schema.partnerPayments).values({
        id: createId(),
        partnerId,
        partnerTaskId: id,
        pricingModel: "per_order",
        unitPrice: 50,
        totalAmount: 50,
      })
    }
    if (input.decision) {
      const userId = createId()
      await db.insert(schema.users).values({
        id: userId,
        name: "Ops",
        email: `ops-${tokenCounter}@example.test`,
        emailVerified: false,
      })
      await db.insert(schema.partnerPaymentDecisions).values({
        id: createId(),
        partnerTaskId: id,
        decision: input.decision,
        decidedBy: userId,
        decidedAt: Date.now(),
      })
    }
    return id
  }

  it("reports a closed task with neither a payment nor any decision", async () => {
    const stranded = await seedTask({ status: "closed" })
    const found = await findClosedTasksWithoutPayment(db)
    expect(found.map((t) => t.id)).toContain(stranded)
    expect(found.find((t) => t.id === stranded)).toMatchObject({
      partnerName: "Fahad Logistics",
      decision: null,
    })
  })

  it("reports a closed task whose decision says pay but whose payment row is missing", async () => {
    // The real production shape: sign-off recorded "full", then failed to price
    // it because the partner had no contract.
    const full = await seedTask({ status: "closed", decision: "full" })
    const partial = await seedTask({ status: "closed", decision: "partial" })
    const ids = (await findClosedTasksWithoutPayment(db)).map((t) => t.id)
    expect(ids).toContain(full)
    expect(ids).toContain(partial)
  })

  it("ignores a closed task that has a payment row", async () => {
    const paid = await seedTask({ status: "closed", payment: true, decision: "full" })
    expect((await findClosedTasksWithoutPayment(db)).map((t) => t.id)).not.toContain(paid)
  })

  it("ignores a deliberate none/hold decision — that is a call, not a stall", async () => {
    const none = await seedTask({ status: "closed", decision: "none" })
    const hold = await seedTask({ status: "closed", decision: "hold" })
    const ids = (await findClosedTasksWithoutPayment(db)).map((t) => t.id)
    expect(ids).not.toContain(none)
    expect(ids).not.toContain(hold)
  })

  it("ignores supplier pickups, which close via warehouse receipt and are never paid here", async () => {
    // Including these would make the invariant fail forever on correct data,
    // which is how a check stops being trusted and then stops being run.
    const pickup = await seedTask({ status: "closed", kind: "supplier_pickup" })
    expect((await findClosedTasksWithoutPayment(db)).map((t) => t.id)).not.toContain(pickup)
  })

  it("ignores tasks that are not closed yet", async () => {
    const open = await seedTask({ status: "in_progress" })
    const awaiting = await seedTask({ status: "pending_signoff" })
    const ids = (await findClosedTasksWithoutPayment(db)).map((t) => t.id)
    expect(ids).not.toContain(open)
    expect(ids).not.toContain(awaiting)
  })
})
