// Delivery Batching v2 P3: getTaskByToken must keep the exact legacy shape
// for single-request tasks (whether truly legacy or a single-request batch —
// both keep partner_task.requestId set, per P2) and switch to the new
// batchGroups shape only for a genuine cross-request batch. Same mock pattern
// as delivery-batching.integration.test.ts.
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

const ADMIN_ID = "admin-user-task-by-token-itest"

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
// The blob delete is a network call; the row is what these tests assert on.
const blobDeletes = vi.hoisted(() => [] as string[])
vi.mock("@vercel/blob", () => ({
  del: vi.fn(async (url: string) => {
    blobDeletes.push(url)
  }),
}))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { createTask, getTaskByToken, deleteTaskPhotoByToken } from "./tasks"
import { createBatchedDeliveryTask } from "./delivery-batching"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "task-by-token-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({ id: ADMIN_ID, name: "Admin", email: "admin@task-by-token-itest.local", role: "admin" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0
async function seedRequestWithItem(quantity: number, customerName: string) {
  seq++
  const customerId = createId()
  const typeId = createId()
  const requestId = createId()
  const requestItemId = createId()

  await db.insert(schema.customers).values({ id: customerId, name: customerName, mobile: "0555000000" })
  await db.insert(schema.requestTypes).values({ id: typeId, slug: `by-token-${seq}`, nameEn: "Delivery", nameAr: "توصيل" })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-TOKEN-${seq}`,
    trackingCode: `TRKT${seq}${createId().slice(0, 4)}`,
    typeId,
    customerId,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({ id: requestItemId, requestId, description: `Item ${seq}`, quantity })
  return { requestId, requestItemId, customerId }
}

describe("getTaskByToken — Delivery Batching v2 P3", () => {
  test("legacy single-request task: unchanged flat shape, batchGroups is null", async () => {
    const a = await seedRequestWithItem(2, "Legacy Customer")
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Legacy", status: "active" })

    const created = await createTask(a.requestId, { scheduledDate: "2026-01-15", partnerId })
    expect(created.error).toBeUndefined()

    const data = await getTaskByToken(created.taskToken as string)
    expect(data).not.toBeNull()
    expect(data?.batchGroups).toBeNull()
    expect(data?.request?.id).toBe(a.requestId)
    expect(data?.customer?.name).toBe("Legacy Customer")
    expect(data?.items).toHaveLength(1)
  })

  test("single-request batch (all items happen to belong to one request): same flat shape as legacy", async () => {
    const a = await seedRequestWithItem(2, "Single Batch Customer")
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Single Batch", status: "active" })

    const created = await createBatchedDeliveryTask([{ requestItemId: a.requestItemId, qty: 2 }], { partnerId })
    expect(created.error).toBeUndefined()

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id as string))
    expect(task.requestId).toBe(a.requestId) // legacy pointer kept — single-request batch

    const data = await getTaskByToken(created.taskToken as string)
    expect(data?.batchGroups).toBeNull()
    expect(data?.request?.id).toBe(a.requestId)
    expect(data?.customer?.name).toBe("Single Batch Customer")
  })

  test("genuine cross-request batch: request/customer null, items grouped correctly by request", async () => {
    const a = await seedRequestWithItem(1, "Customer A")
    const b = await seedRequestWithItem(2, "Customer B")
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Cross Batch", status: "active" })

    const created = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 2 },
      ],
      { partnerId }
    )
    expect(created.error).toBeUndefined()

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id as string))
    expect(task.requestId).toBeNull()

    const data = await getTaskByToken(created.taskToken as string)
    expect(data).not.toBeNull()
    expect(data?.request).toBeNull()
    expect(data?.customer).toBeNull()
    expect(data?.items).toEqual([])
    expect(data?.batchGroups).not.toBeNull()
    expect(data?.batchGroups).toHaveLength(2)

    const groupA = data?.batchGroups?.find((g) => g.request.id === a.requestId)
    const groupB = data?.batchGroups?.find((g) => g.request.id === b.requestId)
    expect(groupA?.customer?.name).toBe("Customer A")
    expect(groupA?.items).toHaveLength(1)
    expect(groupA?.items[0].quantity).toBe(1)
    expect(groupB?.customer?.name).toBe("Customer B")
    expect(groupB?.items).toHaveLength(1)
    expect(groupB?.items[0].quantity).toBe(2)
  })

  test("orphaned batch task (requestId null, zero surviving delivery_task_item rows) is treated as not found", async () => {
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Partner Orphan", status: "active" })
    const taskId = createId()
    const taskToken = createId()
    await db.insert(schema.partnerTasks).values({
      id: taskId,
      requestId: null,
      kind: "request",
      partnerId,
      taskToken,
      taskTokenExpiresAt: Date.now() + 86_400_000,
      status: "pending",
    })
    // Deliberately no delivery_task_item rows — simulates every allocated
    // item having been deleted/reassigned after task creation.

    const data = await getTaskByToken(taskToken)
    expect(data).toBeNull()
  })
})

describe("deleteTaskPhotoByToken", () => {
  async function seedTaskWithPhoto(label: string) {
    const seeded = await seedRequestWithItem(1, `${label} Customer`)
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: `${label} Partner`, status: "active" })
    const created = await createTask(seeded.requestId, { scheduledDate: "2026-02-01", partnerId })
    const token = created.taskToken as string
    const [task] = await db
      .select()
      .from(schema.partnerTasks)
      .where(eq(schema.partnerTasks.taskToken, token))
    await db
      .update(schema.partnerTasks)
      .set({ status: "in_progress" })
      .where(eq(schema.partnerTasks.id, task.id))

    const photoId = createId()
    await db.insert(schema.attachments).values({
      id: photoId,
      entityType: "partner_task",
      entityId: task.id,
      fileName: `${label}.jpg`,
      fileUrl: `https://blob.example/${label}.jpg`,
      fileType: "image/jpeg",
      fileSize: 1024,
      uploadSource: "partner_link",
    })
    return { token, taskId: task.id, photoId }
  }

  test("the courier holding the token can remove their own photo", async () => {
    const { token, photoId } = await seedTaskWithPhoto("Removable")
    const result = await deleteTaskPhotoByToken(token, photoId)
    expect(result.error).toBeUndefined()

    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, photoId))
    expect(rows).toHaveLength(0)
    expect(blobDeletes).toContain("https://blob.example/Removable.jpg")
  })

  // The IDOR this guard exists for: a valid token must not reach another
  // task's evidence just by naming its id.
  test("a valid token cannot delete a photo belonging to another task", async () => {
    const mine = await seedTaskWithPhoto("Mine")
    const theirs = await seedTaskWithPhoto("Theirs")

    const result = await deleteTaskPhotoByToken(mine.token, theirs.photoId)
    expect(result.error).toBe("Photo not found")

    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, theirs.photoId))
    expect(rows).toHaveLength(1)
  })

  test("evidence cannot be removed once the task has moved past in-progress", async () => {
    const { token, taskId, photoId } = await seedTaskWithPhoto("Closed")
    await db
      .update(schema.partnerTasks)
      .set({ status: "pending_signoff" })
      .where(eq(schema.partnerTasks.id, taskId))

    const result = await deleteTaskPhotoByToken(token, photoId)
    expect(result.error).toBe("Task is not in progress")

    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, photoId))
    expect(rows).toHaveLength(1)
  })

  test("an expired link cannot delete anything", async () => {
    const { token, taskId, photoId } = await seedTaskWithPhoto("Expired")
    await db
      .update(schema.partnerTasks)
      .set({ taskTokenExpiresAt: Date.now() - 1000 })
      .where(eq(schema.partnerTasks.id, taskId))

    const result = await deleteTaskPhotoByToken(token, photoId)
    expect(result.error).toBe("Link expired")

    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, photoId))
    expect(rows).toHaveLength(1)
  })
})
