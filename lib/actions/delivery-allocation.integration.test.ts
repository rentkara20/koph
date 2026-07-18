// Coverage for the minimum split-delivery slice: allocation on task creation,
// follow-up delivery for remaining quantity, over-allocation guard, and
// cancellation releasing the reservation. Against an ephemeral migrated
// libsql DB (same mock pattern as delivery-proof.integration.test.ts).
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"

const ADMIN_ID = "admin-user-alloc-itest"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => ({ user: { id: "admin-user-alloc-itest" } })),
  getStaffSession: vi.fn(async () => ({ user: { id: "admin-user-alloc-itest" } })),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { createTask, createFollowUpDeliveryTask, getRemainingQuantitiesForRequest, cancelTask } from "./tasks"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "delivery-allocation-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({ id: ADMIN_ID, name: "Admin", email: "admin@alloc-itest.local", role: "admin" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

let seq = 0
async function seedRequest(quantity: number) {
  seq++
  const customerId = createId()
  const typeId = createId()
  const partnerId = createId()
  const partnerId2 = createId()
  const requestId = createId()
  const requestItemId = createId()

  await db.insert(schema.customers).values({ id: customerId, name: `Cust ${seq}`, mobile: "0555000000" })
  await db.insert(schema.requestTypes).values({ id: typeId, slug: `delivery-alloc-${seq}`, nameEn: "Delivery", nameAr: "توصيل" })
  await db.insert(schema.partners).values({ id: partnerId, name: `Partner A ${seq}`, status: "active" })
  await db.insert(schema.partners).values({ id: partnerId2, name: `Partner B ${seq}`, status: "active" })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-ALLOC-${seq}`,
    trackingCode: `TRKA${seq}${createId().slice(0, 4)}`,
    typeId,
    customerId,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({
    id: requestItemId,
    requestId,
    description: "Laptop",
    quantity,
  })
  return { requestId, requestItemId, partnerId, partnerId2 }
}

const allocationsFor = (requestItemId: string) =>
  db.select().from(schema.deliveryTaskItems).where(eq(schema.deliveryTaskItems.requestItemId, requestItemId))

describe("task creation allocates remaining quantity by default", () => {
  test("first task on a fresh request claims full quantity", async () => {
    const { requestId, requestItemId, partnerId } = await seedRequest(3)
    const res = await createTask(requestId, { partnerId })
    expect(res.error).toBeUndefined()

    const allocs = await allocationsFor(requestItemId)
    expect(allocs).toHaveLength(1)
    expect(allocs[0].qtyPlanned).toBe(3)

    const remaining = await getRemainingQuantitiesForRequest(requestId)
    expect(remaining[0].remaining).toBe(0)
  })

  test("a second default-allocation task on the same request is rejected — nothing left", async () => {
    const { requestId, partnerId, partnerId2 } = await seedRequest(2)
    const first = await createTask(requestId, { partnerId })
    expect(first.error).toBeUndefined()

    const second = await createTask(requestId, { partnerId: partnerId2 })
    expect(second.error).toMatch(/remaining/i)
  })
})

describe("createFollowUpDeliveryTask", () => {
  test("allocates only the requested remaining subset, never over-allocates", async () => {
    const { requestId, requestItemId, partnerId, partnerId2 } = await seedRequest(10)
    const first = await createTask(requestId, { partnerId, items: [{ requestItemId, qty: 6 }] })
    expect(first.error).toBeUndefined()

    const remainingAfterFirst = await getRemainingQuantitiesForRequest(requestId)
    expect(remainingAfterFirst[0].remaining).toBe(4)

    // Follow-up tries to claim more than what's left — rejected.
    const overAlloc = await createFollowUpDeliveryTask(requestId, {
      partnerId: partnerId2,
      items: [{ requestItemId, qty: 5 }],
    })
    expect(overAlloc.error).toMatch(/remaining/i)

    // Follow-up claims exactly what's left — succeeds.
    const followUp = await createFollowUpDeliveryTask(requestId, {
      partnerId: partnerId2,
      items: [{ requestItemId, qty: 4 }],
    })
    expect(followUp.error).toBeUndefined()

    const remainingAfterFollowUp = await getRemainingQuantitiesForRequest(requestId)
    expect(remainingAfterFollowUp[0].remaining).toBe(0)

    const allocs = await allocationsFor(requestItemId)
    expect(allocs).toHaveLength(2)
  })

  test("rejects a contract that does not belong to the selected partner", async () => {
    const { requestId, requestItemId, partnerId, partnerId2 } = await seedRequest(5)
    const contractId = createId()
    await db.insert(schema.partnerContracts).values({
      id: contractId,
      partnerId, // belongs to partnerId, not partnerId2
      name: "Flat",
      pricingModel: "per_order",
      unitPrice: 100,
      status: "active",
    })

    const res = await createFollowUpDeliveryTask(requestId, {
      partnerId: partnerId2,
      contractId,
      items: [{ requestItemId, qty: 5 }],
    })
    expect(res.error).toMatch(/does not belong/i)
  })

  test("rejects a request_item id that belongs to a different request", async () => {
    const { requestId, partnerId } = await seedRequest(5)
    const { requestItemId: otherRequestItemId } = await seedRequest(5)

    const res = await createFollowUpDeliveryTask(requestId, {
      partnerId,
      items: [{ requestItemId: otherRequestItemId, qty: 1 }],
    })
    expect(res.error).toMatch(/do not belong/i)
  })
})

describe("cancellation releases the allocation", () => {
  test("cancelling a task frees its allocated quantity for a new task", async () => {
    const { requestId, requestItemId, partnerId, partnerId2 } = await seedRequest(4)
    const first = await createTask(requestId, { partnerId, items: [{ requestItemId, qty: 4 }] })
    expect(first.error).toBeUndefined()
    expect((await getRemainingQuantitiesForRequest(requestId))[0].remaining).toBe(0)

    const cancelRes = await cancelTask(first.id as string)
    expect(cancelRes.error).toBeUndefined()

    // Allocation row still exists (audit trail) but is excluded from the sum.
    expect((await allocationsFor(requestItemId))).toHaveLength(1)
    expect((await getRemainingQuantitiesForRequest(requestId))[0].remaining).toBe(4)

    const second = await createFollowUpDeliveryTask(requestId, {
      partnerId: partnerId2,
      items: [{ requestItemId, qty: 4 }],
    })
    expect(second.error).toBeUndefined()
  })
})
