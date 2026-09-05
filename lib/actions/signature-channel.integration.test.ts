// The first action-level suite for signature creation.
//
// It exists because `signatures.ts` had four insert sites with three different
// behaviours and no test that would have noticed. These tests pin the
// properties that the single birth function now guarantees, so a fifth insert
// site cannot be added quietly.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { desc, eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { SYSTEM_DEFAULT_CHANNEL_POLICIES } from "@/lib/domain/signature-channel"

const ADMIN_ID = "admin-user-sig-channel-itest"

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
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["user-agent", "vitest"]])),
}))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { createSignatureRequestCore } from "./signature-request-core"
import { createSignatureRequest, requestAuthorizedSignoff, signOnSiteByTaskToken } from "./signatures"
import { createTask } from "./tasks"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sig-channel-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db
    .insert(schema.users)
    .values({ id: ADMIN_ID, name: "Admin", email: "admin@sig-channel-itest.local", role: "admin" })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0
async function seedRequest(customerName = "Channel Customer") {
  seq++
  const customerId = createId()
  const typeId = createId()
  const requestId = createId()
  const requestItemId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: customerName, mobile: "0555000000" })
  await db
    .insert(schema.requestTypes)
    .values({ id: typeId, slug: `sig-channel-${seq}`, nameEn: "Delivery", nameAr: "توصيل" })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-SIGCH-${seq}`,
    trackingCode: `TRKSC${seq}${createId().slice(0, 4)}`,
    typeId,
    customerId,
    quoteNumber: `Q-SIGCH-${seq}`,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({ id: requestItemId, requestId, description: `Item ${seq}`, quantity: 1 })
  return { requestId, requestItemId, customerId }
}

async function loadRequest(id: string) {
  const [row] = await db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.id, id))
  return row
}

describe("createSignatureRequestCore — the one birth function", () => {
  test("every request is born with a verification id (the stage-2 path used to omit it)", async () => {
    const { requestId, customerId } = await seedRequest()
    const created = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Delivery Note",
      initiatedBy: "admin",
      initiatorId: ADMIN_ID,
    })
    const row = await loadRequest(created.id)
    expect(row.verificationId).toBeTruthy()
    expect(row.secureToken).toBe(created.token)
  })

  test("channel policy is applied — customer_link gets OTP and a real expiry", async () => {
    const { requestId, customerId } = await seedRequest()
    const now = 1_700_000_000_000
    const { id } = await createSignatureRequestCore(db, {
      channel: "customer_link",
      requestId,
      customerId,
      documentName: "Delivery Note",
      initiatedBy: "admin",
      initiatorId: ADMIN_ID,
      status: "sent",
      now,
    })
    const row = await loadRequest(id)
    expect(row.channel).toBe("customer_link")
    expect(row.otpEnabled).toBe(true)
    expect(row.expiryEnabled).toBe(true)
    expect(row.expiresAt).toBe(now + SYSTEM_DEFAULT_CHANNEL_POLICIES.customer_link.ttlHours * 3_600_000)
    // A dispatched channel records when it went out; agent_device does not.
    expect(row.sentAt).toBe(now)
  })

  test("agent_device records no sentAt even when born sent — nothing is dispatched", async () => {
    const { requestId, customerId } = await seedRequest()
    const { id } = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Delivery Note",
      initiatedBy: "partner",
      status: "sent",
    })
    const row = await loadRequest(id)
    expect(row.status).toBe("sent")
    expect(row.sentAt).toBeNull()
    expect(row.expiresAt).toBeNull()
  })

  test("a stored channel policy is honoured over the code default", async () => {
    const { requestId, customerId } = await seedRequest()
    const { id } = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Delivery Note",
      initiatedBy: "admin",
      initiatorId: ADMIN_ID,
      storedPolicies: { agent_device: { requireNationalId: false } },
    })
    expect((await loadRequest(id)).requireNationalId).toBe(false)
  })

  test("partner-initiated requests record the agent — initiatorId cannot, a partner is not a user", async () => {
    const { requestId, customerId } = await seedRequest()
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Agent Partner", status: "active" })
    const { id } = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Delivery Note",
      initiatedBy: "partner",
      createdByAgentId: partnerId,
    })
    const row = await loadRequest(id)
    expect(row.initiatorId).toBeNull()
    expect(row.createdByAgentId).toBe(partnerId)
  })
})

describe("existing flows after the unification", () => {
  test("admin createSignatureRequest: draft, agent_device, and its explicit flag beats the channel default", async () => {
    const { requestId } = await seedRequest("Admin Flow Customer")
    const result = await createSignatureRequest(requestId, {
      documentName: "Delivery Note #1",
      requireNationalId: false,
    })
    expect(result.error).toBeUndefined()
    const row = await loadRequest(result.id as string)
    expect(row.status).toBe("draft")
    expect(row.channel).toBe("agent_device")
    // The channel default is true; the admin form said false and must win.
    expect(row.requireNationalId).toBe(false)
    expect(row.verificationId).toBeTruthy()
  })

  test("on-site auto-create: agent_device with the channel's national-ID rule, and the agent recorded", async () => {
    const { requestId } = await seedRequest("On-site Customer")
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "On-site Partner", status: "active" })
    const task = await createTask(requestId, { scheduledDate: "2026-01-15", partnerId })
    expect(task.error).toBeUndefined()
    await db
      .update(schema.partnerTasks)
      .set({ status: "in_progress" })
      .where(eq(schema.partnerTasks.id, task.id as string))

    const signed = await signOnSiteByTaskToken(task.taskToken as string, {
      fullName: "مستلم الشركة",
      nationalId: "1234567890",
      signatureData: "data:image/png;base64,iVBORw0KGgo=",
    })
    expect(signed.error).toBeUndefined()

    const [row] = await db
      .select()
      .from(schema.signatureRequests)
      .where(eq(schema.signatureRequests.requestId, requestId))
      .orderBy(desc(schema.signatureRequests.createdAt))
    expect(row.channel).toBe("agent_device")
    expect(row.requireNationalId).toBe(true)
    expect(row.createdByAgentId).toBe(partnerId)
    expect(row.verificationId).toBeTruthy()
  })

  test("signing records a geo reason even when the browser gave nothing", async () => {
    const { requestId } = await seedRequest("Geo Customer")
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Geo Partner", status: "active" })
    const task = await createTask(requestId, { scheduledDate: "2026-01-16", partnerId })
    await db
      .update(schema.partnerTasks)
      .set({ status: "in_progress" })
      .where(eq(schema.partnerTasks.id, task.id as string))

    const signed = await signOnSiteByTaskToken(task.taskToken as string, {
      fullName: "مستلم",
      nationalId: "1234567890",
      signatureData: "data:image/png;base64,iVBORw0KGgo=",
      geo: { unavailableReason: "user_denied" },
    })
    expect(signed.error).toBeUndefined()

    const [row] = await db
      .select()
      .from(schema.signatureRequests)
      .where(eq(schema.signatureRequests.requestId, requestId))
      .orderBy(desc(schema.signatureRequests.createdAt))
    const [sig] = await db
      .select()
      .from(schema.customerSignatures)
      .where(eq(schema.customerSignatures.signatureRequestId, row.id))
    expect(sig.geoUnavailableReason).toBe("user_denied")
    expect(sig.geoLatitude).toBeNull()
  })

  test("signing stores coordinates when the browser gave a fix", async () => {
    const { requestId } = await seedRequest("Geo Fix Customer")
    const partnerId = createId()
    await db.insert(schema.partners).values({ id: partnerId, name: "Geo Fix Partner", status: "active" })
    const task = await createTask(requestId, { scheduledDate: "2026-01-17", partnerId })
    await db
      .update(schema.partnerTasks)
      .set({ status: "in_progress" })
      .where(eq(schema.partnerTasks.id, task.id as string))

    await signOnSiteByTaskToken(task.taskToken as string, {
      fullName: "مستلم",
      nationalId: "1234567890",
      signatureData: "data:image/png;base64,iVBORw0KGgo=",
      geo: { latitude: 24.7136, longitude: 46.6753, accuracy: 9 },
    })

    const [row] = await db
      .select()
      .from(schema.signatureRequests)
      .where(eq(schema.signatureRequests.requestId, requestId))
      .orderBy(desc(schema.signatureRequests.createdAt))
    const [sig] = await db
      .select()
      .from(schema.customerSignatures)
      .where(eq(schema.customerSignatures.signatureRequestId, row.id))
    expect(sig.geoLatitude).toBeCloseTo(24.7136)
    expect(sig.geoLongitude).toBeCloseTo(46.6753)
    expect(sig.geoAccuracy).toBe(9)
    expect(sig.geoUnavailableReason).toBeNull()
  })

  test("stage-2 authorised signoff inherits the parent's channel and national-ID rule", async () => {
    const { requestId, customerId } = await seedRequest("Corporate Customer")
    await db.insert(schema.customerContacts).values({
      id: createId(),
      customerId,
      name: "المدير المخوّل",
      mobile: "0555111222",
      isAuthorizedSignatory: true,
    })
    const parent = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Delivery Note stage 1",
      initiatedBy: "admin",
      initiatorId: ADMIN_ID,
      status: "sent",
      policyOverrides: { requireNationalId: true },
    })
    await db
      .update(schema.signatureRequests)
      .set({ status: "signed" })
      .where(eq(schema.signatureRequests.id, parent.id))

    const stage2 = await requestAuthorizedSignoff(parent.id)
    expect(stage2.error).toBeUndefined()
    const row = await loadRequest(stage2.id as string)
    expect(row.signatoryRole).toBe("authorized")
    expect(row.parentSignatureRequestId).toBe(parent.id)
    expect(row.channel).toBe("agent_device")
    expect(row.requireNationalId).toBe(true)
    // Was null before the unification, which left /verify/[id] unreachable.
    expect(row.verificationId).toBeTruthy()
  })

  test("stage-2 off a LEGACY parent does not inherit the unrecorded channel", async () => {
    const { requestId, customerId } = await seedRequest("Legacy Parent Customer")
    await db.insert(schema.customerContacts).values({
      id: createId(),
      customerId,
      name: "مخوّل",
      mobile: "0555111444",
      isAuthorizedSignatory: true,
    })
    const parent = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Legacy note",
      initiatedBy: "admin",
      initiatorId: ADMIN_ID,
      status: "sent",
    })
    // Simulate a row that predates the channel column, as the migration marks
    // every pre-existing row.
    await db
      .update(schema.signatureRequests)
      .set({ status: "signed", channel: "legacy_unknown" })
      .where(eq(schema.signatureRequests.id, parent.id))

    const stage2 = await requestAuthorizedSignoff(parent.id)
    expect(stage2.error).toBeUndefined()
    const row = await loadRequest(stage2.id as string)
    // A fresh request must carry a real channel, never "unrecorded".
    expect(row.channel).toBe("agent_device")
  })

  test("stage-2 is not duplicated on a second call", async () => {
    const { requestId, customerId } = await seedRequest("Corporate Customer 2")
    await db.insert(schema.customerContacts).values({
      id: createId(),
      customerId,
      name: "مخوّل",
      mobile: "0555111333",
      isAuthorizedSignatory: true,
    })
    const parent = await createSignatureRequestCore(db, {
      channel: "agent_device",
      requestId,
      customerId,
      documentName: "Delivery Note stage 1",
      initiatedBy: "admin",
      initiatorId: ADMIN_ID,
      status: "sent",
    })
    await db
      .update(schema.signatureRequests)
      .set({ status: "signed" })
      .where(eq(schema.signatureRequests.id, parent.id))

    const first = await requestAuthorizedSignoff(parent.id)
    const second = await requestAuthorizedSignoff(parent.id)
    expect(second.id).toBe(first.id)
  })
})
