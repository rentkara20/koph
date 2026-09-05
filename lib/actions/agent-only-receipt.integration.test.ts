// The one-sided collection receipt: the rep took the devices, nobody on the
// customer's side could sign.
//
// The whole design rests on one refusal — Kara's own signature must never
// satisfy the customer-proof gate that releases the partner payment. Everything
// else here exists to keep the receipt usable afterwards: the customer's note
// stays unsigned so it can still be printed, emailed, signed on paper and
// uploaded through the manual-return path.
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { and, eq } from "drizzle-orm"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

const ADMIN_ID = "admin-agent-only"

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["user-agent", "vitest"]])),
}))
vi.mock("@/lib/auth/session", () => ({
  getSessionWithRole: vi.fn(async () => ({ user: { id: ADMIN_ID } })),
  getStaffSession: vi.fn(async () => ({ user: { id: ADMIN_ID } })),
}))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import {
  approveManualSignature,
  signAgentOnlyByTaskToken,
  submitSignature,
  uploadManualSignature,
} from "./signatures"
import { signOffTask } from "./tasks"
import { getDeliveryNoteData } from "./delivery-notes"

const COLLECTION_TYPE = "type-collection-agent-only"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-only-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db.insert(schema.users).values({
    id: ADMIN_ID, name: "Admin", email: "admin@agent-only.local", role: "admin",
  })
  await db.insert(schema.requestTypes).values({
    id: COLLECTION_TYPE, slug: "collection", nameEn: "Collection", nameAr: "استلام",
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0

/** A collection out for pickup: one partner task, no signature yet. */
async function seedCollectionInProgress() {
  const suffix = `a${seq++}`
  const customerId = createId()
  const requestId = createId()
  const partnerId = createId()
  const taskToken = `task-${suffix}`

  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${suffix}` })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-${suffix}`,
    trackingCode: `TRK-${suffix}`,
    typeId: COLLECTION_TYPE,
    customerId,
    status: "in_progress",
  })
  await db.insert(schema.requestItems).values({
    id: createId(), requestId, description: "Laptop", quantity: 1,
  })
  await db.insert(schema.partners).values({ id: partnerId, name: `Partner ${suffix}` })
  const taskId = createId()
  await db.insert(schema.partnerTasks).values({
    id: taskId,
    kind: "request",
    partnerId,
    requestId,
    status: "in_progress",
    taskToken,
    taskTokenExpiresAt: Date.UTC(2027, 0, 1),
  })
  return { customerId, requestId, taskId, taskToken }
}

const signAsAgent = (taskToken: string, over: Record<string, unknown> = {}) =>
  signAgentOnlyByTaskToken(taskToken, {
    fullName: "احمد محمد",
    signatureData: "data:image/png;base64,iVBORw0KGgo=",
    customerAbsenceReason: "المسؤول كان في إجازة والمخزن مقفول",
    deliveryOutcome: "full_no_remarks",
    ...over,
  })

const sigsFor = (requestId: string) =>
  db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.requestId, requestId))

beforeEach(() => vi.clearAllMocks())

describe("signAgentOnlyByTaskToken", () => {
  test("signs in Kara's own box and leaves the customer's note unsigned", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()

    expect((await signAsAgent(taskToken)).error).toBeUndefined()

    const rows = await sigsFor(requestId)
    const parent = rows.find((r) => r.signatoryRole === "receiver")
    const agent = rows.find((r) => r.signatoryRole === "kara_agent")
    expect(agent?.status).toBe("signed")
    // The customer's note is untouched, so it can still be printed, emailed,
    // signed on paper and uploaded.
    expect(parent?.status).toBe("sent")
    expect(agent?.parentSignatureRequestId).toBe(parent?.id)
  })

  test("records why the customer did not sign", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()

    await signAsAgent(taskToken)

    const [agent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "kara_agent")
    expect(agent.customerAbsenceReason).toBe("المسؤول كان في إجازة والمخزن مقفول")
  })

  test("refuses without a stated reason — an unexplained one-sided receipt is the bug", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()

    const result = await signAsAgent(taskToken, { customerAbsenceReason: "   " })

    expect(result.error).toBeTruthy()
    expect(await sigsFor(requestId)).toHaveLength(0)
  })

  test("never stores a national ID for our own employee", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()

    await signAsAgent(taskToken)

    const [agent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "kara_agent")
    const [sig] = await db
      .select()
      .from(schema.customerSignatures)
      .where(eq(schema.customerSignatures.signatureRequestId, agent.id))
    expect(sig.nationalId).toBeNull()
    expect(agent.requireNationalId).toBe(false)
  })

  test("moves the task to pending_signoff but records NO customer signature time", async () => {
    const { taskId, taskToken } = await seedCollectionInProgress()

    await signAsAgent(taskToken)

    const [task] = await db
      .select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    // The devices really moved.
    expect(task.status).toBe("pending_signoff")
    expect(task.deliveredAt).not.toBeNull()
    // But nothing was received from the customer, and the null is what tells
    // the admin queue this receipt is one-sided.
    expect(task.signatureReceivedAt).toBeNull()
  })

  test("is idempotent — a retry does not mint a second receipt", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()

    await signAsAgent(taskToken)
    const second = await signAsAgent(taskToken)

    expect(second.error).toBe("This document is already signed or cancelled")
    const agents = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "kara_agent")
    expect(agents).toHaveLength(1)
  })

  test("refuses once the customer has actually signed", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()
    // Open the customer's note and sign it for real.
    await signAsAgent(taskToken)
    const [parent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "receiver")
    await db.delete(schema.signatureRequests)
      .where(and(
        eq(schema.signatureRequests.requestId, requestId),
        eq(schema.signatureRequests.signatoryRole, "kara_agent"),
      ))
    await submitSignature(parent.secureToken, {
      fullName: "عميل",
      mobile: "0500000000",
      nationalId: "1234567890",
      signatureData: "data:image/png;base64,iVBORw0KGgo=",
    })

    const result = await signAsAgent(taskToken)

    expect(result.error).toBe("The customer has already signed — use the countersignature instead")
  })
})

describe("the receipt it produces", () => {
  test("leaves the customer's signature box blank so it can still be signed on paper", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()
    await signAsAgent(taskToken)
    const [parent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "receiver")

    const data = await getDeliveryNoteData(parent.secureToken)

    // Nothing printed in the customer's box — not a name, not a "did not sign"
    // stamp. The page has to stay usable for a wet signature.
    expect(data?.signature).toBeNull()
    expect(data?.agent?.fullName).toBe("احمد محمد")
    expect(data?.requiresAgent).toBe(true)
  })

  test("still carries a statement of condition — the rep's, since nobody else reported one", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()
    const [item] = await db
      .select().from(schema.requestItems).where(eq(schema.requestItems.requestId, requestId))
    await signAsAgent(taskToken, {
      itemConditions: [{ requestItemId: item.id, condition: "damaged" }],
    })
    const [parent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "receiver")

    const data = await getDeliveryNoteData(parent.secureToken)

    expect(data?.items[0]?.condition).toBe("damaged")
  })

  test("renders the same receipt from the rep's own token", async () => {
    const { requestId, taskToken } = await seedCollectionInProgress()
    const signed = await signAsAgent(taskToken)
    const [parent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "receiver")

    const fromChild = await getDeliveryNoteData(signed.token!)

    expect(fromChild?.sig.id).toBe(parent.id)
    expect(fromChild?.signature).toBeNull()
  })
})

describe("the payment gate", () => {
  /**
   * The gate only bites when proof enforcement is on and the request type
   * demands a signature — the exact configuration where "who signed" decides
   * whether money moves.
   */
  async function enableProofEnforcement() {
    await db.insert(schema.appSettings)
      .values({ key: "proofEnforcementEnabled", value: JSON.stringify(true) })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value: JSON.stringify(true) },
      })
    await db.insert(schema.appSettings)
      .values({ key: "proofDefaultSignature", value: JSON.stringify(true) })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value: JSON.stringify(true) },
      })
  }

  test("Kara's own signature never satisfies the customer-proof gate", async () => {
    await enableProofEnforcement()
    const { taskId, taskToken } = await seedCollectionInProgress()
    await signAsAgent(taskToken)

    const result = await signOffTask(taskId, { decision: "full" })

    // Letting this through would mean Kara certifying its own collection and
    // paying the partner on it.
    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/signature/i)
  })

  test("an attributed, reasoned admin override is the way through", async () => {
    await enableProofEnforcement()
    const { taskId, taskToken } = await seedCollectionInProgress()
    await signAsAgent(taskToken)

    const result = await signOffTask(taskId, {
      decision: "full",
      proofOverrideReason: "تأكيد شفهي من مدير تقنية المعلومات بالعميل",
    })

    expect(result.error).toBeUndefined()
    // The waiver is on the record, not just in the closer's head.
    const trail = await db
      .select()
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.action, "task_closed_without_customer_proof"))
    expect(trail).toHaveLength(1)
    expect(trail[0].i18nData).toContain("تأكيد شفهي")
  })

  test("refuses an override with an empty reason — a blank waiver is no waiver", async () => {
    await enableProofEnforcement()
    const { taskId, taskToken } = await seedCollectionInProgress()
    await signAsAgent(taskToken)

    const result = await signOffTask(taskId, { decision: "full", proofOverrideReason: "  " })

    expect(result.error).toBe("State a reason to close this task without customer proof")
  })

  test("the customer's later paper signature opens the gate normally", async () => {
    await enableProofEnforcement()
    const { requestId, taskId, taskToken } = await seedCollectionInProgress()
    await signAsAgent(taskToken)
    const [parent] = (await sigsFor(requestId)).filter((r) => r.signatoryRole === "receiver")

    // The receipt was printed, signed by hand and returned.
    await uploadManualSignature(parent.id, {
      fileUrl: "https://blob.example/signed.pdf",
      fileName: "signed.pdf",
      fullName: "محمد عبدالله جميل",
    })
    await approveManualSignature(parent.id)

    const result = await signOffTask(taskId, { decision: "full" })

    expect(result.error).toBeUndefined()
  })
})
