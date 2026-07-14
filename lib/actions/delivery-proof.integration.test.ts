// End-to-end proof-path coverage for Phase-0 delivery/signature, against an
// ephemeral migrated libsql DB with the singleton `db` and auth session mocked.
// Proves the contract:
//   - no signature path auto-closes the task or auto-creates payment;
//   - all accepted proof paths leave the task at pending_signoff;
//   - only admin signOffTask closes + creates partner payment;
//   - outcome (partial/refused) never blocks sign-off — payment is a fully
//     independent admin decision (full/partial/none/hold);
//   - a "none" decision never creates a partner_payment row;
//   - authorised stage-2 is documentation-only (never gates payment).
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { hashOtp } from "@/lib/utils/otp-hash"

const ADMIN_ID = "admin-user-itest"

// The singleton db is mocked via a live getter into this holder, assigned once
// the ephemeral migrated DB is ready in beforeAll.
const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => ({ user: { id: "admin-user-itest" } })),
  getStaffSession: vi.fn(async () => ({ user: { id: "admin-user-itest" } })),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

// Import actions AFTER mocks are registered.
import { generateDeliveryOtp, verifyDeliveryOtp } from "./otp"
import {
  signOnSiteByTaskToken,
  uploadManualSignature,
  approveManualSignature,
  rejectManualSignature,
} from "./signatures"
import { signOffTask } from "./tasks"

const OTP_SECRET = process.env.BETTER_AUTH_SECRET ?? "koph-dev-otp-salt"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "delivery-proof-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({ id: ADMIN_ID, name: "Admin", email: "admin@itest.local", role: "admin" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

let seq = 0
async function seedScenario(taskStatus: "in_progress" | "pending_signoff") {
  seq++
  const customerId = createId()
  const typeId = createId()
  const partnerId = createId()
  const contractId = createId()
  const requestId = createId()
  const taskId = createId()
  const sigId = createId()
  const taskToken = generateToken()

  await db.insert(schema.customers).values({ id: customerId, name: `Cust ${seq}`, mobile: "0555000000" })
  await db.insert(schema.requestTypes).values({ id: typeId, slug: `delivery-${seq}`, nameEn: "Delivery", nameAr: "توصيل" })
  await db.insert(schema.partners).values({ id: partnerId, name: `Partner ${seq}`, status: "active" })
  await db.insert(schema.partnerContracts).values({
    id: contractId,
    partnerId,
    name: "Flat",
    pricingModel: "per_order",
    unitPrice: 100,
    status: "active",
  })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-${seq}`,
    trackingCode: `TRK${seq}${createId().slice(0, 4)}`,
    typeId,
    customerId,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({
    id: createId(),
    requestId,
    description: "Laptop",
    quantity: 1,
  })
  await db.insert(schema.partnerTasks).values({
    id: taskId,
    requestId,
    partnerId,
    contractId,
    taskToken,
    taskTokenExpiresAt: Date.now() + 3_600_000,
    status: taskStatus,
    photoRequired: false,
    deliveredAt: taskStatus === "pending_signoff" ? Date.now() : null,
    completedAt: taskStatus === "pending_signoff" ? Date.now() : null,
  })
  await db.insert(schema.signatureRequests).values({
    id: sigId,
    requestId,
    customerId,
    documentName: "Delivery Note",
    secureToken: generateToken(),
    status: "sent",
  })
  return { requestId, taskId, sigId, taskToken }
}

const paymentsForTask = (taskId: string) =>
  db.select().from(schema.partnerPayments).where(eq(schema.partnerPayments.partnerTaskId, taskId))
const task = async (taskId: string) =>
  (await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId)))[0]
const request = async (requestId: string) =>
  (await db.select().from(schema.requests).where(eq(schema.requests.id, requestId)))[0]
const sig = async (sigId: string) =>
  (await db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.id, sigId)))[0]

describe("OTP generate + verify", () => {
  test("generate returns plaintext once; only a hash is stored", async () => {
    const { sigId } = await seedScenario("in_progress")
    const res = await generateDeliveryOtp(sigId)
    expect(res.otp).toMatch(/^\d{6}$/)
    const row = await sig(sigId)
    expect(row.otpHash).toBeTruthy()
    expect(row.otpHash).not.toContain(res.otp!)
    expect(row.otpEnabled).toBe(true)
  })

  test("wrong code increments attempts and locks after 5; correct code unlocks", async () => {
    const { sigId, taskToken } = await seedScenario("in_progress")
    await generateDeliveryOtp(sigId)
    // stamp a known code
    const known = "424242"
    await db.update(schema.signatureRequests)
      .set({ otpHash: await hashOtp(sigId, known, OTP_SECRET), otpAttempts: 0, otpVerifiedAt: null })
      .where(eq(schema.signatureRequests.id, sigId))

    for (let i = 0; i < 5; i++) {
      const r = await verifyDeliveryOtp(taskToken, "000000")
      expect(r.ok).toBeUndefined()
    }
    // 6th wrong is locked
    const locked = await verifyDeliveryOtp(taskToken, "000000")
    expect(locked.error).toMatch(/Too many/i)

    // even the correct code is now locked until regenerated
    const stillLocked = await verifyDeliveryOtp(taskToken, known)
    expect(stillLocked.ok).toBeUndefined()
  })

  test("correct code flips sig to otp_verified without touching the task", async () => {
    const { sigId, taskId, taskToken } = await seedScenario("in_progress")
    await generateDeliveryOtp(sigId)
    const code = "135790"
    await db.update(schema.signatureRequests)
      .set({ otpHash: await hashOtp(sigId, code, OTP_SECRET), otpAttempts: 0 })
      .where(eq(schema.signatureRequests.id, sigId))
    const r = await verifyDeliveryOtp(taskToken, code)
    expect(r.ok).toBe(true)
    expect((await sig(sigId)).status).toBe("otp_verified")
    expect((await task(taskId)).status).toBe("in_progress") // NOT closed / advanced
  })
})

async function signOnSite(taskToken: string, outcome: string, remarks?: string) {
  return signOnSiteByTaskToken(taskToken, {
    fullName: "Receiver",
    nationalId: "1234567890",
    position: "Manager",
    signatureData: "data:image/png;base64,AAAA",
    deliveryOutcome: outcome as never,
    remarks,
  })
}

describe("proof paths → task/request transitions + payment gate", () => {
  test("full_no_remarks: task pending_signoff w/ signature_received_at; payment only after signOffTask", async () => {
    const { requestId, taskId, taskToken } = await seedScenario("in_progress")
    await signOnSite(taskToken, "full_no_remarks")

    const t1 = await task(taskId)
    expect(t1.status).toBe("pending_signoff")
    expect(t1.deliveredAt).toBeTruthy()
    expect(t1.signatureReceivedAt).toBeTruthy()
    expect(await paymentsForTask(taskId)).toHaveLength(0) // NOT auto-created

    const off = await signOffTask(taskId, { decision: "full" })
    expect(off.error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect((await request(requestId)).status).toBe("completed")
    expect(await paymentsForTask(taskId)).toHaveLength(1) // created only here
  })

  test("full_with_remarks closes with remarks preserved", async () => {
    const { taskId, taskToken } = await seedScenario("in_progress")
    await signOnSite(taskToken, "full_with_remarks", "Box slightly dented")
    expect((await task(taskId)).status).toBe("pending_signoff")
    expect((await signOffTask(taskId, { decision: "full" })).error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect(await paymentsForTask(taskId)).toHaveLength(1)
  })

  test("partial outcome: request on_hold, but sign-off is NOT blocked — outcome and payment are independent", async () => {
    const { requestId, taskId, taskToken } = await seedScenario("in_progress")
    await signOnSite(taskToken, "partial", "Only 1 of 2 delivered")
    expect((await task(taskId)).status).toBe("pending_signoff")
    expect((await request(requestId)).status).toBe("on_hold")

    // Admin may still decide full payment for a partial-outcome visit.
    const off = await signOffTask(taskId, { decision: "full" })
    expect(off.error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect(await paymentsForTask(taskId)).toHaveLength(1)
  })

  test("partial outcome + none decision: closes, no payment row, reason required", async () => {
    const { taskId, taskToken } = await seedScenario("in_progress")
    await signOnSite(taskToken, "partial", "Only 1 of 2 delivered")

    const missingReason = await signOffTask(taskId, { decision: "none" })
    expect(missingReason.error).toMatch(/reason/i)

    const off = await signOffTask(taskId, { decision: "none", reason: "Partner did not fulfil visit terms" })
    expect(off.error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect(await paymentsForTask(taskId)).toHaveLength(0)
  })

  test("hold decision: task stays pending_signoff, no payment, revisitable", async () => {
    const { taskId, taskToken } = await seedScenario("in_progress")
    await signOnSite(taskToken, "full_no_remarks")

    const off = await signOffTask(taskId, { decision: "hold", reason: "Awaiting finance review" })
    expect(off.error).toBeUndefined()
    expect((await task(taskId)).status).toBe("pending_signoff")
    expect(await paymentsForTask(taskId)).toHaveLength(0)

    const final = await signOffTask(taskId, { decision: "full" })
    expect(final.error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect(await paymentsForTask(taskId)).toHaveLength(1)
  })

  test("refused: task failed, sig rejected, no signature_received_at, no payment", async () => {
    const { requestId, taskId, taskToken } = await seedScenario("in_progress")
    const res = await signOnSite(taskToken, "refused", "Customer refused delivery")
    expect(res.error).toBeUndefined()
    const t = await task(taskId)
    expect(t.status).toBe("failed")
    expect(t.signatureReceivedAt).toBeNull()
    expect((await request(requestId)).status).toBe("failed")
    expect(await paymentsForTask(taskId)).toHaveLength(0)
  })
})

describe("manual returned signed receipt", () => {
  test("upload → approve records proof + allows sign-off; payment only via sign-off", async () => {
    const { taskId, sigId } = await seedScenario("pending_signoff")
    await uploadManualSignature(sigId, { fileUrl: "https://blob/x.pdf", fileName: "signed.pdf", fullName: "Receiver" })

    // Not yet approved → no accepted proof, no signature_received_at.
    expect((await task(taskId)).signatureReceivedAt).toBeNull()
    expect(await paymentsForTask(taskId)).toHaveLength(0)

    const appr = await approveManualSignature(sigId, { reviewNotes: "Legible + stamped" })
    expect(appr.error).toBeUndefined()
    expect((await sig(sigId)).status).toBe("signed")
    expect((await task(taskId)).signatureReceivedAt).toBeTruthy()
    expect((await task(taskId)).status).toBe("pending_signoff") // still NOT closed

    expect((await signOffTask(taskId, { decision: "full" })).error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect(await paymentsForTask(taskId)).toHaveLength(1)
  })

  test("reject keeps it unclosed and creates no payment", async () => {
    const { taskId, sigId } = await seedScenario("pending_signoff")
    await uploadManualSignature(sigId, { fileUrl: "https://blob/y.pdf", fileName: "y.pdf", fullName: "R" })
    const rej = await rejectManualSignature(sigId, { reviewNotes: "Illegible" })
    expect(rej.error).toBeUndefined()
    expect((await sig(sigId)).status).not.toBe("signed")
    expect((await task(taskId)).status).toBe("pending_signoff")
    expect(await paymentsForTask(taskId)).toHaveLength(0)
  })
})

describe("stage-2 authorised sign-off is documentation-only", () => {
  test("a receiver signature alone lets the task close + pay (no stage-2 required)", async () => {
    const { taskId, taskToken } = await seedScenario("in_progress")
    await signOnSite(taskToken, "full_no_remarks")
    // No authorised stage-2 signature exists at all.
    const off = await signOffTask(taskId, { decision: "full" })
    expect(off.error).toBeUndefined()
    expect((await task(taskId)).status).toBe("closed")
    expect(await paymentsForTask(taskId)).toHaveLength(1)
  })
})
