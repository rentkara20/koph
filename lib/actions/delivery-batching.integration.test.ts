// Delivery Batching v2 P2: one partner_task spanning items from TWO different
// customer requests — proves delivery_task_item is the real source of truth
// for request coverage (task.requestId stays null on a genuine cross-request
// batch), and that request-status sync/task-listing correctly derive through
// it instead of reading the task's own (legacy/advisory) requestId column.
// Same mock pattern as delivery-allocation.integration.test.ts.
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

const ADMIN_ID = "admin-user-batching-itest"

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

import { createBatchedDeliveryTask, getDeliverableItems } from "./delivery-batching"
import { getAffectedRequestIds, getTasksForRequest, updateTaskByToken, cancelTask } from "./tasks"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "delivery-batching-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({ id: ADMIN_ID, name: "Admin", email: "admin@batching-itest.local", role: "admin" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0
async function seedRequestWithItem(quantity: number) {
  seq++
  const customerId = createId()
  const typeId = createId()
  const requestId = createId()
  const requestItemId = createId()

  await db.insert(schema.customers).values({ id: customerId, name: `Cust ${seq}`, mobile: "0555000000" })
  await db.insert(schema.requestTypes).values({ id: typeId, slug: `batching-${seq}`, nameEn: "Delivery", nameAr: "توصيل" })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-BATCH-${seq}`,
    trackingCode: `TRKB${seq}${createId().slice(0, 4)}`,
    typeId,
    customerId,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({ id: requestItemId, requestId, description: "Item", quantity })
  return { requestId, requestItemId }
}

describe("cross-request delivery batching", () => {
  test("one task spanning two requests keeps requestId null and derives coverage via delivery_task_item", async () => {
    const a = await seedRequestWithItem(2)
    const b = await seedRequestWithItem(1)
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Batch", status: "active" })

    const result = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 2 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId }
    )
    expect(result.error).toBeUndefined()
    const taskId = result.id as string

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.requestId).toBeNull() // genuine cross-request batch — legacy pointer stays unset

    const items = await db.select().from(schema.deliveryTaskItems).where(eq(schema.deliveryTaskItems.partnerTaskId, taskId))
    expect(items).toHaveLength(2)

    const affected = (await getAffectedRequestIds(taskId)).sort()
    expect(affected).toEqual([a.requestId, b.requestId].sort())

    // Task-listing on EACH request's own page must surface this batched task
    // (visibility fix — previously only eq(partnerTasks.requestId, ...) was checked).
    const tasksForA = await getTasksForRequest(a.requestId)
    const tasksForB = await getTasksForRequest(b.requestId)
    expect(tasksForA.map((t) => t.id)).toContain(taskId)
    expect(tasksForB.map((t) => t.id)).toContain(taskId)
  })

  test("a partner status transition on a batched task syncs status for every affected request", async () => {
    const a = await seedRequestWithItem(1)
    const b = await seedRequestWithItem(1)
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Batch 2", status: "active" })

    const result = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId }
    )
    const taskId = result.id as string
    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))

    // Partner accepts via magic link — both requests should move to in_progress.
    await updateTaskByToken(task.taskToken, "accept")

    const [reqA] = await db.select().from(schema.requests).where(eq(schema.requests.id, a.requestId))
    const [reqB] = await db.select().from(schema.requests).where(eq(schema.requests.id, b.requestId))
    expect(reqA.status).toBe("in_progress")
    expect(reqB.status).toBe("in_progress")
  })

  test("cancelling a batched task releases allocation and syncs all affected requests", async () => {
    const a = await seedRequestWithItem(1)
    const b = await seedRequestWithItem(1)
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Batch 3", status: "active" })

    const result = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId }
    )
    const taskId = result.id as string

    const cancelResult = await cancelTask(taskId)
    expect(cancelResult.error).toBeUndefined()

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.status).toBe("cancelled")

    // Status sync cascaded to BOTH affected requests (not just one) — with no
    // other active/closed task left, deriveRequestStatus correctly moves each
    // to "failed" (pre-existing domain rule, unrelated to batching).
    const [reqA] = await db.select().from(schema.requests).where(eq(schema.requests.id, a.requestId))
    const [reqB] = await db.select().from(schema.requests).where(eq(schema.requests.id, b.requestId))
    expect(reqA.status).toBe("failed")
    expect(reqB.status).toBe("failed")

    // Cancelled task's allocation no longer counts as open — a brand-new task
    // can still claim the full original quantity on either item.
    const retryPartnerId = createId()
    await db.insert(schema.partners).values({ id: retryPartnerId, name: "Retry Partner", status: "active" })
    const retry = await createBatchedDeliveryTask(
      [{ requestItemId: a.requestItemId, qty: 1 }],
      { partnerId: retryPartnerId }
    )
    expect(retry.error).toBeUndefined()
  })

  test("rejects a batch that includes an item from a cancelled request", async () => {
    const a = await seedRequestWithItem(1)
    const b = await seedRequestWithItem(1)
    await db.update(schema.requests).set({ status: "cancelled" }).where(eq(schema.requests.id, b.requestId))
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Batch 4", status: "active" })

    const result = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId }
    )
    expect(result.error).toMatch(/cancelled/i)
  })

  test("rejects a batch containing an unknown requestItemId", async () => {
    const a = await seedRequestWithItem(1)
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Batch 5", status: "active" })

    const result = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: "does-not-exist", qty: 1 },
      ],
      { partnerId }
    )
    expect(result.error).toMatch(/not found/i)
  })

  test("rejects zero/negative-qty-only input and ignores a zero-qty line mixed with a valid one", async () => {
    const a = await seedRequestWithItem(2)
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Batch 6", status: "active" })

    const allZero = await createBatchedDeliveryTask([{ requestItemId: a.requestItemId, qty: 0 }], { partnerId })
    expect(allZero.error).toMatch(/select at least one item/i)

    const b = await seedRequestWithItem(1)
    const mixed = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 0 }, // ignored, not allocated
      ],
      { partnerId }
    )
    expect(mixed.error).toBeUndefined()
    const items = await db
      .select()
      .from(schema.deliveryTaskItems)
      .where(eq(schema.deliveryTaskItems.partnerTaskId, mixed.id as string))
    expect(items).toHaveLength(1)
    expect(items[0].requestItemId).toBe(a.requestItemId)
  })

  // Batch sign-off is implemented in Delivery Batching v2 P4 — see
  // signoff-batching.integration.test.ts for the per-request-aware coverage
  // (proof gate, payment, request-status) that superseded this P2-era test.
})
