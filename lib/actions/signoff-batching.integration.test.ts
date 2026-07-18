// Delivery Batching v2 P4: signature stays per request (never merged across
// requests in a batch), and admin sign-off requires EVERY request a batched
// task touches to have its own accepted proof before the task can close.
// Payment stays task-scoped (one trip, one payment) — unaffected by batching.
// Same mock pattern as delivery-batching.integration.test.ts.
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

const ADMIN_ID = "admin-user-signoff-batching-itest"

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

import { createTask, signOffTask, rejectTaskProof, updateTaskByToken } from "./tasks"
import { createBatchedDeliveryTask } from "./delivery-batching"
import { signOnSiteForRequestGroup, signOnSiteByTaskToken } from "./signatures"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "signoff-batching-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({ id: ADMIN_ID, name: "Admin", email: "admin@signoff-batching-itest.local", role: "admin" })
  // Proof enforcement ON + request types require a signature, so the P4 gate
  // (every request in the batch needs its own accepted proof) is exercised.
  await db.insert(schema.appSettings).values({
    key: "proofEnforcementEnabled",
    value: "true",
    updatedBy: ADMIN_ID,
    updatedAt: Date.now(),
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0
async function seedRequestWithItem(quantity: number, customerName: string, requireSignature = true) {
  seq++
  const customerId = createId()
  const typeId = createId()
  const requestId = createId()
  const requestItemId = createId()

  await db.insert(schema.customers).values({ id: customerId, name: customerName, mobile: "0555000000" })
  await db.insert(schema.requestTypes).values({
    id: typeId,
    slug: `signoff-batch-${seq}`,
    nameEn: "Delivery",
    nameAr: "توصيل",
    proofConfig: JSON.stringify({ signature: requireSignature }),
  })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-SB-${seq}`,
    trackingCode: `TRKSB${seq}${createId().slice(0, 4)}`,
    typeId,
    customerId,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({ id: requestItemId, requestId, description: `Item ${seq}`, quantity })
  return { requestId, requestItemId, customerId, typeId }
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
  return { partnerId, contractId, photoRequired: false }
}

function fullSignPayload(fullName: string) {
  return {
    fullName,
    nationalId: "1234567890",
    signatureData: "data:image/png;base64,AAAA",
    deliveryOutcome: "full_no_remarks" as const,
  }
}

describe("Delivery Batching v2 P4 — signature + sign-off", () => {
  test("legacy single-request task: unchanged — sign then sign off closes and pays", async () => {
    const a = await seedRequestWithItem(1, "Legacy Customer")
    const { partnerId, contractId } = await seedPartnerWithContract()

    const created = await createTask(a.requestId, { partnerId, contractId, photoRequired: false })
    expect(created.error).toBeUndefined()
    const taskToken = created.taskToken as string
    const taskId = created.id as string

    await updateTaskByToken(taskToken, "accept")
    await updateTaskByToken(taskToken, "start")

    const signed = await signOnSiteByTaskToken(taskToken, fullSignPayload("Legacy Signer"))
    expect(signed.error).toBeUndefined()

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.status).toBe("pending_signoff") // on-site signing still auto-advances legacy tasks

    const off = await signOffTask(taskId, { decision: "full", quantity: 1 })
    expect(off.error).toBeUndefined()

    const [closedTask] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(closedTask.status).toBe("closed")
    const payments = await db.select().from(schema.partnerPayments).where(eq(schema.partnerPayments.partnerTaskId, taskId))
    expect(payments).toHaveLength(1)
  })

  test("single-request batch: sign via signOnSiteForRequestGroup, task doesn't auto-advance, mark_done + sign-off closes", async () => {
    const a = await seedRequestWithItem(1, "Single Batch Customer")
    const { partnerId, contractId } = await seedPartnerWithContract()

    const created = await createBatchedDeliveryTask([{ requestItemId: a.requestItemId, qty: 1 }], { partnerId, contractId, photoRequired: false })
    expect(created.error).toBeUndefined()
    const taskToken = created.taskToken as string
    const taskId = created.id as string

    await updateTaskByToken(taskToken, "accept")
    await updateTaskByToken(taskToken, "start")

    const signed = await signOnSiteForRequestGroup(taskToken, a.requestId, fullSignPayload("Single Batch Signer"))
    expect(signed.error).toBeUndefined()

    // Group signing never flips task status itself — courier drives it.
    const [afterSign] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(afterSign.status).toBe("in_progress")

    await updateTaskByToken(taskToken, "mark_done")
    const [pendingSignoff] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(pendingSignoff.status).toBe("pending_signoff")

    const off = await signOffTask(taskId, { decision: "full", quantity: 1 })
    expect(off.error).toBeUndefined()

    const [closedTask] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(closedTask.status).toBe("closed")
    const payments = await db.select().from(schema.partnerPayments).where(eq(schema.partnerPayments.partnerTaskId, taskId))
    expect(payments).toHaveLength(1)
  })

  test("cross-request batch: two separate signature_requests, sign-off blocked until BOTH signed", async () => {
    const a = await seedRequestWithItem(1, "Customer A")
    const b = await seedRequestWithItem(1, "Customer B")
    const { partnerId, contractId } = await seedPartnerWithContract()

    const created = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId, contractId, photoRequired: false }
    )
    const taskToken = created.taskToken as string
    const taskId = created.id as string

    await updateTaskByToken(taskToken, "accept")
    await updateTaskByToken(taskToken, "start")

    // Only request A signs.
    const signedA = await signOnSiteForRequestGroup(taskToken, a.requestId, fullSignPayload("Signer A"))
    expect(signedA.error).toBeUndefined()

    await updateTaskByToken(taskToken, "mark_done")

    // Sign-off must fail clearly, naming the still-unsigned request.
    const blocked = await signOffTask(taskId, { decision: "full", quantity: 2 })
    expect(blocked.error).toMatch(/signature is required/i)
    expect(blocked.error).toMatch(/REQ-SB/) // names the specific missing request
    const [stillPending] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(stillPending.status).toBe("pending_signoff")

    // Two distinct signature_request rows exist, each scoped to its own request.
    const sigReqs = await db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.partnerTaskId, taskId))
    expect(sigReqs).toHaveLength(1) // only A has signed so far — B's doesn't exist yet
    expect(sigReqs[0].requestId).toBe(a.requestId)

    // Now B signs too.
    const signedB = await signOnSiteForRequestGroup(taskToken, b.requestId, fullSignPayload("Signer B"))
    expect(signedB.error).toBeUndefined()

    const allSigReqs = await db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.partnerTaskId, taskId))
    expect(allSigReqs).toHaveLength(2)
    expect(new Set(allSigReqs.map((s) => s.requestId))).toEqual(new Set([a.requestId, b.requestId]))

    // Sign-off now succeeds — ONE task close, ONE payment, for the whole batch.
    const off = await signOffTask(taskId, { decision: "full", quantity: 2 })
    expect(off.error).toBeUndefined()

    const [closedTask] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(closedTask.status).toBe("closed")
    const payments = await db.select().from(schema.partnerPayments).where(eq(schema.partnerPayments.partnerTaskId, taskId))
    expect(payments).toHaveLength(1)

    // Both requests independently synced to completed (task closed, no other
    // open tasks) — request status is derived per request, not just "task done".
    const [reqA] = await db.select().from(schema.requests).where(eq(schema.requests.id, a.requestId))
    const [reqB] = await db.select().from(schema.requests).where(eq(schema.requests.id, b.requestId))
    expect(reqA.status).toBe("completed")
    expect(reqB.status).toBe("completed")
  })

  test("partial delivery: signature_item_condition for a signed group only includes that group's own items", async () => {
    const a = await seedRequestWithItem(2, "Customer Partial A") // 2 items worth of qty
    const b = await seedRequestWithItem(1, "Customer Partial B")
    const { partnerId, contractId } = await seedPartnerWithContract()

    const created = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 2 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId, contractId, photoRequired: false }
    )
    const taskToken = created.taskToken as string

    await updateTaskByToken(taskToken, "accept")
    await updateTaskByToken(taskToken, "start")

    // Sign group A with an item condition — must be accepted since the item
    // belongs to A's own slice of the task.
    const signedA = await signOnSiteForRequestGroup(taskToken, a.requestId, {
      ...fullSignPayload("Signer A"),
      itemConditions: [{ requestItemId: a.requestItemId, condition: "good", receivedQuantity: 2 }],
    })
    expect(signedA.error).toBeUndefined()

    const [sigReqA] = await db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.requestId, a.requestId))
    const conditionsA = await db
      .select()
      .from(schema.signatureItemConditions)
      .where(eq(schema.signatureItemConditions.signatureRequestId, sigReqA.id))
    expect(conditionsA).toHaveLength(1)
    expect(conditionsA[0].requestItemId).toBe(a.requestItemId)

    // Attempting to record a condition for B's item under A's signing request
    // must be rejected — a group's signature can only cover its own items.
    const crossGroupAttempt = await signOnSiteForRequestGroup(taskToken, a.requestId, {
      ...fullSignPayload("Signer A retry"),
      itemConditions: [{ requestItemId: b.requestItemId, condition: "good", receivedQuantity: 1 }],
    })
    expect(crossGroupAttempt.error).toMatch(/do not belong/i)

    // B is still unsigned — sign-off must still be blocked (partial-signing state).
    await updateTaskByToken(taskToken, "mark_done")
    const { signOffTask: signOff } = await import("./tasks")
    const blocked = await signOff(created.id as string, { decision: "full", quantity: 3 })
    expect(blocked.error).toMatch(/signature is required/i)
  })

  test("mixed proof-config batch: only the request that requires signature gates sign-off", async () => {
    const needsProof = await seedRequestWithItem(1, "Needs Proof", true)
    const noProof = await seedRequestWithItem(1, "No Proof Required", false)
    const { partnerId, contractId } = await seedPartnerWithContract()

    const created = await createBatchedDeliveryTask(
      [
        { requestItemId: needsProof.requestItemId, qty: 1 },
        { requestItemId: noProof.requestItemId, qty: 1 },
      ],
      { partnerId, contractId, photoRequired: false }
    )
    const taskToken = created.taskToken as string
    const taskId = created.id as string

    await updateTaskByToken(taskToken, "accept")
    await updateTaskByToken(taskToken, "start")

    // Only the request that actually requires signature signs — the other
    // never gets a signature_request created at all.
    const signed = await signOnSiteForRequestGroup(taskToken, needsProof.requestId, fullSignPayload("Signer"))
    expect(signed.error).toBeUndefined()

    const sigReqs = await db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.partnerTaskId, taskId))
    expect(sigReqs).toHaveLength(1)
    expect(sigReqs[0].requestId).toBe(needsProof.requestId)

    await updateTaskByToken(taskToken, "mark_done")

    // Sign-off succeeds even though noProof's request was never signed.
    const off = await signOffTask(taskId, { decision: "full", quantity: 2 })
    expect(off.error).toBeUndefined()
    const [closedTask] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(closedTask.status).toBe("closed")
  })

  test("rejectTaskProof on a batched task returns it to in_progress and logs activity for every affected request", async () => {
    const a = await seedRequestWithItem(1, "Reject Customer A")
    const b = await seedRequestWithItem(1, "Reject Customer B")
    const { partnerId, contractId } = await seedPartnerWithContract()

    const created = await createBatchedDeliveryTask(
      [
        { requestItemId: a.requestItemId, qty: 1 },
        { requestItemId: b.requestItemId, qty: 1 },
      ],
      { partnerId, contractId, photoRequired: false }
    )
    const taskToken = created.taskToken as string
    const taskId = created.id as string

    await updateTaskByToken(taskToken, "accept")
    await updateTaskByToken(taskToken, "start")
    await signOnSiteForRequestGroup(taskToken, a.requestId, fullSignPayload("Signer A"))
    await signOnSiteForRequestGroup(taskToken, b.requestId, fullSignPayload("Signer B"))
    await updateTaskByToken(taskToken, "mark_done")

    const [beforeReject] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(beforeReject.status).toBe("pending_signoff")

    const rejected = await rejectTaskProof(taskId, "Proof looked wrong")
    expect(rejected.error).toBeUndefined()

    const [afterReject] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(afterReject.status).toBe("in_progress")

    const activities = await db
      .select()
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.action, "task_proof_rejected"))
    const forThisTask = activities.filter((row) => [a.requestId, b.requestId].includes(row.entityId))
    expect(forThisTask).toHaveLength(2) // one activity entry per affected request
  })
})
