// Ad-hoc partner tasks: an operational trip with no customer request and no
// purchase order. Coverage asserts the isolation guarantees — creation sets no
// request/PO/case anchor, the DB constraint rejects a mislinked ad_hoc row, the
// partner runs the normal request lifecycle over the magic link with photo-only
// proof (no signature/OTP), and admin sign-off closes + pays WITHOUT touching
// any request or PO. Same mock pattern as signoff-batching.integration.test.ts.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { and, eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

const ADMIN_ID = "admin-user-ad-hoc-itest"

const holder = vi.hoisted(() => ({
  db: null as unknown,
  userRole: "admin" as string,
  sessionUserId: "admin-user-ad-hoc-itest" as string,
}))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => ({ user: { id: ADMIN_ID } })),
  getStaffSession: vi.fn(async () => ({ user: { id: ADMIN_ID } })),
  getSession: vi.fn(async () => ({ user: { id: holder.sessionUserId, role: holder.userRole } })),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { createAdHocPartnerTask } from "./ad-hoc-partner-tasks"
import { getTaskByToken, updateTaskByToken, signOffTask } from "./tasks"
import { getMyTasks } from "./partner-portal"

async function seedPartner(opts: { userId?: string } = {}) {
  const partnerId = createId()
  await db.insert(schema.partners).values({
    id: partnerId,
    name: "Ad-hoc Partner",
    status: "active",
    userId: opts.userId ?? null,
  })
  return partnerId
}

async function seedContract(partnerId: string) {
  const contractId = createId()
  await db.insert(schema.partnerContracts).values({
    id: contractId,
    partnerId,
    name: "Flat trip fee",
    pricingModel: "fixed",
    unitPrice: 75,
    status: "active",
  })
  return contractId
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ad-hoc-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({
    id: ADMIN_ID,
    name: "Admin",
    email: "admin@ad-hoc-itest.local",
    role: "admin",
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("createAdHocPartnerTask", () => {
  test("creates an ad_hoc task with no request / PO / case anchor", async () => {
    const partnerId = await seedPartner()
    const res = await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "Drop laptop at Riyadh office",
      adHocReason: "internal_delivery",
      destinationLocation: "Riyadh HQ",
    })
    expect(res.error).toBeUndefined()
    expect(res.id).toBeTruthy()

    const [row] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, res.id!))
    expect(row.kind).toBe("ad_hoc")
    expect(row.requestId).toBeNull()
    expect(row.purchaseOrderId).toBeNull()
    expect(row.procurementCaseId).toBeNull()
    expect(row.status).toBe("pending")
    expect(row.adHocTitle).toBe("Drop laptop at Riyadh office")
    expect(row.adHocReason).toBe("internal_delivery")
    expect(row.assignedBy).toBe(ADMIN_ID)
  })

  test("rejects a missing title", async () => {
    const partnerId = await seedPartner()
    const res = await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "",
      adHocReason: "other",
    })
    expect(res.error).toBe("Invalid input")
  })

  test("rejects a contract that belongs to another partner", async () => {
    const partnerA = await seedPartner()
    const partnerB = await seedPartner()
    const contractB = await seedContract(partnerB)
    const res = await createAdHocPartnerTask({
      partnerId: partnerA,
      adHocTitle: "Trip",
      adHocReason: "other",
      contractId: contractB,
    })
    expect(res.error).toBe("Contract does not belong to this partner")
  })
})

describe("DB single-origin constraint", () => {
  test("rejects an ad_hoc row that carries a request_id", async () => {
    const partnerId = await seedPartner()
    await expect(
      db.insert(schema.partnerTasks).values({
        id: createId(),
        kind: "ad_hoc",
        requestId: "some-request-id",
        partnerId,
        taskToken: createId(),
        taskTokenExpiresAt: Date.now() + 1_000_000,
        status: "pending",
      })
    ).rejects.toThrow()
  })
})

describe("partner magic-link lifecycle (photo-only, no signature/OTP)", () => {
  test("getTaskByToken returns ad_hoc context, and the partner can run pending → closed", async () => {
    const partnerId = await seedPartner()
    // photoRequired: false keeps this test focused on the transition machine.
    const created = await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "Collect device from supplier branch",
      adHocReason: "manual_pickup",
      photoRequired: false,
    })
    const [row] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    const token = row.taskToken

    const view = await getTaskByToken(token)
    expect(view).not.toBeNull()
    expect(view!.task.kind).toBe("ad_hoc")
    expect(view!.request).toBeNull()
    expect(view!.task.adHocTitle).toBe("Collect device from supplier branch")

    expect((await updateTaskByToken(token, "accept")).error).toBeUndefined()
    expect((await updateTaskByToken(token, "start")).error).toBeUndefined()
    expect((await updateTaskByToken(token, "mark_done")).error).toBeUndefined()

    const [after] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    expect(after.status).toBe("pending_signoff")
  })

  test("mark_done is blocked until a photo exists when photoRequired", async () => {
    const partnerId = await seedPartner()
    const created = await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "Photo-gated trip",
      adHocReason: "other",
      // photoRequired defaults to true
    })
    const [row] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    const token = row.taskToken

    await updateTaskByToken(token, "accept")
    await updateTaskByToken(token, "start")
    const blocked = await updateTaskByToken(token, "mark_done")
    expect(blocked.error).toBe("PHOTO_REQUIRED")

    await db.insert(schema.attachments).values({
      id: createId(),
      entityType: "partner_task",
      entityId: created.id!,
      fileName: "proof.jpg",
      fileUrl: "https://example.com/proof.jpg",
      fileType: "image/jpeg",
      fileSize: 1234,
      uploadSource: "partner_link",
      provider: "vercel_blob",
      sensitivity: "operational",
    })
    const ok = await updateTaskByToken(token, "mark_done")
    expect(ok.error).toBeUndefined()
  })
})

describe("admin sign-off (no request context)", () => {
  test("closes an ad_hoc task and creates a payment, touching no request/PO", async () => {
    const partnerId = await seedPartner()
    const contractId = await seedContract(partnerId)
    const created = await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "Paid trip",
      adHocReason: "supplier_visit",
      contractId,
      photoRequired: false,
    })
    const [row] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    const token = row.taskToken

    await updateTaskByToken(token, "accept")
    await updateTaskByToken(token, "start")
    await updateTaskByToken(token, "mark_done")

    // No payment exists before sign-off.
    const before = await db
      .select()
      .from(schema.partnerPayments)
      .where(eq(schema.partnerPayments.partnerTaskId, created.id!))
    expect(before).toHaveLength(0)

    const off = await signOffTask(created.id!, { decision: "full" })
    expect(off.error).toBeUndefined()

    const [closed] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    expect(closed.status).toBe("closed")
    expect(closed.closedBy).toBe(ADMIN_ID)

    const payments = await db
      .select()
      .from(schema.partnerPayments)
      .where(eq(schema.partnerPayments.partnerTaskId, created.id!))
    expect(payments).toHaveLength(1)
    expect(payments[0].totalAmount).toBe(75)

    const decisions = await db
      .select()
      .from(schema.partnerPaymentDecisions)
      .where(eq(schema.partnerPaymentDecisions.partnerTaskId, created.id!))
    expect(decisions).toHaveLength(1)
    expect(decisions[0].decision).toBe("full")
  })

  test("decision=none closes without a payment row", async () => {
    const partnerId = await seedPartner()
    const contractId = await seedContract(partnerId)
    const created = await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "Unpaid trip",
      adHocReason: "other",
      contractId,
      photoRequired: false,
    })
    const [row] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    const token = row.taskToken
    await updateTaskByToken(token, "accept")
    await updateTaskByToken(token, "start")
    await updateTaskByToken(token, "mark_done")

    const off = await signOffTask(created.id!, { decision: "none", reason: "goodwill trip" })
    expect(off.error).toBeUndefined()

    const [closed] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, created.id!))
    expect(closed.status).toBe("closed")
    const payments = await db
      .select()
      .from(schema.partnerPayments)
      .where(eq(schema.partnerPayments.partnerTaskId, created.id!))
    expect(payments).toHaveLength(0)
  })
})

describe("partner portal listing", () => {
  test("getMyTasks includes ad_hoc tasks with their title/reason", async () => {
    const userId = createId()
    await db.insert(schema.users).values({
      id: userId,
      name: "Portal Partner",
      email: `partner-${userId}@ad-hoc-itest.local`,
      role: "partner",
    })
    const partnerId = await seedPartner({ userId })
    await createAdHocPartnerTask({
      partnerId,
      adHocTitle: "Listed trip",
      adHocReason: "asset_transfer",
    })

    holder.userRole = "partner"
    holder.sessionUserId = userId
    const result = await getMyTasks()
    holder.userRole = "admin"
    holder.sessionUserId = ADMIN_ID

    expect(result).not.toBeNull()
    const adHoc = result!.tasks.find((t) => t.kind === "ad_hoc")
    expect(adHoc).toBeTruthy()
    expect(adHoc!.adHocTitle).toBe("Listed trip")
    expect(adHoc!.adHocReason).toBe("asset_transfer")
    expect(adHoc!.requestNumber).toBeNull()
  })
})
