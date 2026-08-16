// Which devices actually move when an admin signs a task off.
//
// Regression origin: once Delivery Batching v2 started writing
// delivery_task_item rows, sign-off only transitioned units whose row was
// verification_status='approved' AND qty_delivered>0. Nobody used the
// per-item reporting flow, so in production every one of those rows sat at
// "unreported" — the filter matched nothing, the whole-request fallback was
// skipped because rows existed, and 25 devices across 7 completed requests
// stayed "assigned" forever while their tasks closed and paid out.
//
// Contract now:
//   - an explicit approved subset wins and moves only those devices;
//   - nothing reported == nothing said, so the whole request moves;
//   - a signed "partial"/"refused" outcome blocks the fallback, because the
//     receiver put in writing that not everything changed hands;
//   - the partner PAYMENT decision never influences any of it.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq, inArray } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

const ADMIN_ID = "admin-user-signoff-assets-itest"

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
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { createTask, signOffTask, updateTaskByToken } from "./tasks"
import { createBatchedDeliveryTask } from "./delivery-batching"

// The asset transition only fires for these type slugs, so the slug must be
// the real "delivery" — a made-up slug silently skips the whole OI-1 block.
const DELIVERY_TYPE = "type-delivery-signoff-assets"

let seq = 0

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "signoff-assets-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({
    id: ADMIN_ID,
    name: "Admin",
    email: "admin@signoff-assets-itest.local",
    role: "admin",
  })
  await db.insert(schema.requestTypes).values({
    id: DELIVERY_TYPE,
    slug: "delivery",
    nameEn: "Delivery",
    nameAr: "توصيل",
    // Proof off: these tests are about which devices move, not the proof gate.
    proofConfig: JSON.stringify({ signature: false }),
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A delivery request whose items are real assets sitting at "assigned". */
async function seedRequestWithUnits(unitCount: number) {
  seq++
  const customerId = createId()
  const orderId = createId()
  const orderLineId = createId()
  const requestId = createId()

  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${seq}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber: `SA-${seq}`, customerId })
  await db.insert(schema.orderLines).values({
    id: orderLineId,
    orderId,
    description: "Laptop",
    quantity: unitCount,
  })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-SA-${seq}`,
    trackingCode: `TRKSA${seq}${createId().slice(0, 4)}`,
    typeId: DELIVERY_TYPE,
    customerId,
    quoteNumber: `SA-${seq}`,
    status: "in_progress",
  })

  const items: { requestItemId: string; unitId: string }[] = []
  for (let i = 0; i < unitCount; i++) {
    const unitId = createId()
    const requestItemId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: `SA-${seq}-${i}`,
      status: "assigned",
    })
    await db.insert(schema.requestItems).values({
      id: requestItemId,
      requestId,
      description: "Laptop",
      quantity: 1,
      orderUnitId: unitId,
    })
    items.push({ requestItemId, unitId })
  }
  return { requestId, customerId, items }
}

async function seedPartnerWithContract() {
  const partnerId = createId()
  const contractId = createId()
  await db.insert(schema.partners).values({ id: partnerId, name: `Partner ${createId().slice(0, 6)}`, status: "active" })
  await db.insert(schema.partnerContracts).values({
    id: contractId,
    partnerId,
    name: "Flat",
    pricingModel: "per_order",
    unitPrice: 100,
    status: "active",
  })
  return { partnerId, contractId }
}

async function statusesOf(unitIds: string[]) {
  const rows = await db
    .select({ id: schema.orderUnits.id, status: schema.orderUnits.status })
    .from(schema.orderUnits)
    .where(inArray(schema.orderUnits.id, unitIds))
  return new Map(rows.map((r) => [r.id, r.status]))
}

/** Records a signed receipt carrying a given outcome, bypassing the UI. */
async function seedSignedOutcome(
  requestId: string,
  customerId: string,
  outcome: "full_no_remarks" | "partial" | "refused"
) {
  const sigReqId = createId()
  await db.insert(schema.signatureRequests).values({
    id: sigReqId,
    requestId,
    customerId,
    documentName: "Delivery Note",
    secureToken: `sa-tok-${sigReqId}`,
    status: "signed",
  })
  await db.insert(schema.customerSignatures).values({
    id: createId(),
    signatureRequestId: sigReqId,
    fullName: "Receiver",
    mobile: "0500000000",
    signatureData: "data:image/png;base64,AAAA",
    signedAt: Date.now(),
    deliveryOutcome: outcome,
  })
}

/** Drives a batched task (which writes delivery_task_item rows) to sign-off. */
async function batchedTaskReadyForSignoff(requestItemIds: string[]) {
  const { partnerId, contractId } = await seedPartnerWithContract()
  const created = await createBatchedDeliveryTask(
    requestItemIds.map((requestItemId) => ({ requestItemId, qty: 1 })),
    { partnerId, contractId, photoRequired: false }
  )
  expect(created.error).toBeUndefined()
  const token = created.taskToken as string
  await updateTaskByToken(token, "accept")
  await updateTaskByToken(token, "start")
  await updateTaskByToken(token, "mark_done")
  return created.id as string
}

describe("signOffTask — which devices move", () => {
  test("batched task with nothing reported still delivers the whole request", async () => {
    // The exact production shape: delivery_task_item rows exist, every one of
    // them "unreported" with qty_delivered 0.
    const r = await seedRequestWithUnits(3)
    const taskId = await batchedTaskReadyForSignoff(r.items.map((i) => i.requestItemId))

    const dtis = await db
      .select()
      .from(schema.deliveryTaskItems)
      .where(eq(schema.deliveryTaskItems.partnerTaskId, taskId))
    expect(dtis).toHaveLength(3)
    expect(dtis.every((d) => d.verificationStatus === "unreported" && d.qtyDelivered === 0)).toBe(true)

    const off = await signOffTask(taskId, { decision: "full", quantity: 3 })
    expect(off.error).toBeUndefined()

    const statuses = await statusesOf(r.items.map((i) => i.unitId))
    for (const { unitId } of r.items) expect(statuses.get(unitId)).toBe("delivered")
  })

  test("legacy task with no reporting rows keeps delivering the whole request", async () => {
    const r = await seedRequestWithUnits(2)
    const { partnerId, contractId } = await seedPartnerWithContract()
    const created = await createTask(r.requestId, { scheduledDate: "2026-01-15", partnerId, contractId, photoRequired: false })
    expect(created.error).toBeUndefined()
    const token = created.taskToken as string
    await updateTaskByToken(token, "accept")
    await updateTaskByToken(token, "start")
    await updateTaskByToken(token, "mark_done")

    const off = await signOffTask(created.id as string, { decision: "full", quantity: 2 })
    expect(off.error).toBeUndefined()

    const statuses = await statusesOf(r.items.map((i) => i.unitId))
    for (const { unitId } of r.items) expect(statuses.get(unitId)).toBe("delivered")
  })

  test("an explicit approved subset moves only those devices", async () => {
    const r = await seedRequestWithUnits(3)
    const taskId = await batchedTaskReadyForSignoff(r.items.map((i) => i.requestItemId))

    // Only the first device was actually reported as handed over.
    await db
      .update(schema.deliveryTaskItems)
      .set({ verificationStatus: "approved", qtyDelivered: 1 })
      .where(eq(schema.deliveryTaskItems.requestItemId, r.items[0].requestItemId))

    const off = await signOffTask(taskId, { decision: "full", quantity: 3 })
    expect(off.error).toBeUndefined()

    const statuses = await statusesOf(r.items.map((i) => i.unitId))
    expect(statuses.get(r.items[0].unitId)).toBe("delivered")
    // Reporting some items is a deliberate statement about the rest.
    expect(statuses.get(r.items[1].unitId)).toBe("assigned")
    expect(statuses.get(r.items[2].unitId)).toBe("assigned")
  })

  test("a signed partial outcome blocks the whole-request fallback", async () => {
    const r = await seedRequestWithUnits(2)
    await seedSignedOutcome(r.requestId, r.customerId, "partial")
    const taskId = await batchedTaskReadyForSignoff(r.items.map((i) => i.requestItemId))

    const off = await signOffTask(taskId, { decision: "full", quantity: 2 })
    expect(off.error).toBeUndefined()

    // The customer signed that not everything arrived — moving both would
    // record a fact the signed document contradicts.
    const statuses = await statusesOf(r.items.map((i) => i.unitId))
    for (const { unitId } of r.items) expect(statuses.get(unitId)).toBe("assigned")
  })

  test("a signed full outcome delivers normally", async () => {
    const r = await seedRequestWithUnits(2)
    await seedSignedOutcome(r.requestId, r.customerId, "full_no_remarks")
    const taskId = await batchedTaskReadyForSignoff(r.items.map((i) => i.requestItemId))

    const off = await signOffTask(taskId, { decision: "full", quantity: 2 })
    expect(off.error).toBeUndefined()

    const statuses = await statusesOf(r.items.map((i) => i.unitId))
    for (const { unitId } of r.items) expect(statuses.get(unitId)).toBe("delivered")
  })

  test("docking the partner's fee does not hold devices back", async () => {
    // Payment decision and asset custody are independent: a late or messy trip
    // can be paid partially while every device still reached the customer.
    const r = await seedRequestWithUnits(2)
    const taskId = await batchedTaskReadyForSignoff(r.items.map((i) => i.requestItemId))

    const off = await signOffTask(taskId, {
      decision: "partial",
      quantity: 2,
      approvedAmount: 40,
      reason: "Arrived outside the agreed window",
    })
    expect(off.error).toBeUndefined()

    const statuses = await statusesOf(r.items.map((i) => i.unitId))
    for (const { unitId } of r.items) expect(statuses.get(unitId)).toBe("delivered")
  })
})
