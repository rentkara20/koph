// The two-party collection receipt, at the data layer.
//
// A collection is a handover between two parties: the customer RELEASES the
// devices and Kara's rep TAKES them. Before this, only one signature fit on the
// note, so the rep signed in the customer's box — leaving a receipt that claims
// the customer released devices to themselves. These tests pin the contract
// that keeps the two parties in their own boxes on the ONE receipt.
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { eq } from "drizzle-orm"
import { migrate } from "@/lib/db/test-migrate"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

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
  getSessionWithRole: vi.fn(async () => ({ user: { id: "admin-1" } })),
  getStaffSession: vi.fn(async () => ({ user: { id: "admin-1" } })),
}))

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import {
  getPendingAgentCountersignToken,
  requestAgentCountersign,
  submitSignature,
} from "./signatures"
import { getDeliveryNoteData } from "./delivery-notes"

const DELIVERY_TYPE = "type-delivery"
const COLLECTION_TYPE = "type-collection"

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-countersign-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })

  await db.insert(schema.users).values({
    id: "admin-1",
    name: "Admin",
    email: "admin@example.test",
    role: "admin",
  })
  await db.insert(schema.requestTypes).values([
    { id: DELIVERY_TYPE, slug: "delivery", nameEn: "Delivery", nameAr: "تسليم" },
    { id: COLLECTION_TYPE, slug: "collection", nameEn: "Collection", nameAr: "استلام" },
  ])
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let seq = 0

/**
 * A collection whose stage-1 has already been signed by the customer —
 * the state the rep's countersignature is chained from.
 */
async function seedSignedStageOne({
  typeId = COLLECTION_TYPE,
  channel = "agent_device" as schema.SignatureRequest["channel"],
  status = "signed" as schema.SignatureRequest["status"],
} = {}) {
  const suffix = `s${seq++}`
  const customerId = createId()
  const requestId = createId()
  const sigId = createId()

  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${suffix}` })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-${suffix}`,
    trackingCode: `TRK-${suffix}`,
    typeId,
    customerId,
    status: "completed",
  })
  await db.insert(schema.signatureRequests).values({
    id: sigId,
    requestId,
    customerId,
    channel,
    signatoryRole: "receiver",
    documentName: `Collection Receipt #${suffix}`,
    secureToken: `token-${suffix}`,
    verificationId: `VER-${suffix}`,
    requireNationalId: true,
    status,
  })
  if (status === "signed") {
    await db.insert(schema.customerSignatures).values({
      id: createId(),
      signatureRequestId: sigId,
      fullName: "عميل مُسلِّم",
      mobile: "0500000000",
      signatureData: "data:image/png;base64,CUSTOMER",
    })
  }
  return { customerId, requestId, sigId, token: `token-${suffix}` }
}

async function loadChild(parentId: string) {
  const [child] = await db
    .select()
    .from(schema.signatureRequests)
    .where(eq(schema.signatureRequests.parentSignatureRequestId, parentId))
  return child ?? null
}

beforeEach(() => vi.clearAllMocks())

describe("requestAgentCountersign", () => {
  test("opens a kara_agent stage chained to the signed customer note", async () => {
    const { sigId } = await seedSignedStageOne()

    const result = await requestAgentCountersign(sigId)

    expect(result.error).toBeUndefined()
    const child = await loadChild(sigId)
    expect(child?.signatoryRole).toBe("kara_agent")
    expect(child?.parentSignatureRequestId).toBe(sigId)
    expect(child?.status).toBe("sent")
  })

  test("never demands an Iqama from Kara's own rep, even when stage 1 did", async () => {
    const { sigId } = await seedSignedStageOne()

    await requestAgentCountersign(sigId)

    expect((await loadChild(sigId))?.requireNationalId).toBe(false)
  })

  test("is idempotent — a second call returns the same stage, not a rival token", async () => {
    const { sigId } = await seedSignedStageOne()

    const first = await requestAgentCountersign(sigId)
    const second = await requestAgentCountersign(sigId)

    expect(second.id).toBe(first.id)
    expect(second.token).toBe(first.token)
  })

  test("refuses to open before the customer has signed", async () => {
    const { sigId } = await seedSignedStageOne({ status: "sent" })

    const result = await requestAgentCountersign(sigId)

    expect(result.error).toBe("The receiver must sign first")
    expect(await loadChild(sigId)).toBeNull()
  })

  test("refuses to countersign a countersignature", async () => {
    const { sigId } = await seedSignedStageOne()
    await requestAgentCountersign(sigId)
    const child = await loadChild(sigId)
    await db
      .update(schema.signatureRequests)
      .set({ status: "signed" })
      .where(eq(schema.signatureRequests.id, child!.id))

    const result = await requestAgentCountersign(child!.id)

    expect(result.error).toBe("A countersignature cannot itself be countersigned")
  })
})

describe("getPendingAgentCountersignToken", () => {
  test("hands the rep their link on the tablet the customer just signed on", async () => {
    const { sigId } = await seedSignedStageOne({ channel: "agent_device" })
    const { token } = await requestAgentCountersign(sigId)

    expect(await getPendingAgentCountersignToken(sigId)).toBe(token)
  })

  test("withholds it on a remote channel, where the parent link is the customer's", async () => {
    const { sigId } = await seedSignedStageOne({ channel: "customer_link" })
    await requestAgentCountersign(sigId)

    // The customer holds the WhatsApp link; handing them this token would let
    // them sign as Kara.
    expect(await getPendingAgentCountersignToken(sigId)).toBeNull()
  })

  test("goes quiet once the rep has signed", async () => {
    const { sigId } = await seedSignedStageOne()
    await requestAgentCountersign(sigId)
    const child = await loadChild(sigId)
    await db
      .update(schema.signatureRequests)
      .set({ status: "signed" })
      .where(eq(schema.signatureRequests.id, child!.id))

    expect(await getPendingAgentCountersignToken(sigId)).toBeNull()
  })
})

describe("the receipt both parties end up on", () => {
  test("prints the rep's captured signature in the rep's own box", async () => {
    const { sigId, token } = await seedSignedStageOne()
    await requestAgentCountersign(sigId)
    const child = await loadChild(sigId)
    await db.insert(schema.customerSignatures).values({
      id: createId(),
      signatureRequestId: child!.id,
      fullName: "احمد محمد",
      mobile: "0511111111",
      signatureData: "data:image/png;base64,REP",
    })

    const data = await getDeliveryNoteData(token)

    // Two parties, two boxes, one receipt.
    expect(data?.signature?.fullName).toBe("عميل مُسلِّم")
    expect(data?.agent?.fullName).toBe("احمد محمد")
    expect(data?.agent?.signatureData).toBe("data:image/png;base64,REP")
    expect(data?.requiresAgent).toBe(true)
  })

  test("renders the same one receipt from the rep's own token", async () => {
    const { sigId, token } = await seedSignedStageOne()
    const { token: childToken } = await requestAgentCountersign(sigId)

    const fromParent = await getDeliveryNoteData(token)
    const fromChild = await getDeliveryNoteData(childToken!)

    expect(fromChild?.sig.id).toBe(fromParent?.sig.id)
    expect(fromChild?.signature?.fullName).toBe("عميل مُسلِّم")
  })

  test("leaves a delivery note with no Kara-side stage at all", async () => {
    const { sigId, token } = await seedSignedStageOne({ typeId: DELIVERY_TYPE })

    const data = await getDeliveryNoteData(token)

    expect(data?.requiresAgent).toBe(false)
    expect(data?.agent).toBeNull()
    // A delivery never auto-chains; nothing was opened behind our back.
    expect(await loadChild(sigId)).toBeNull()
  })
})

describe("the chain that fires on its own", () => {
  const sign = (token: string, fullName: string) =>
    submitSignature(token, {
      fullName,
      mobile: "0500000000",
      nationalId: "1234567890",
      signatureData: "data:image/png;base64,iVBORw0KGgo=",
    })

  test("opens the rep's stage the moment the customer signs a collection", async () => {
    // Unsigned on purpose — this test signs it through the real action.
    const { sigId, token } = await seedSignedStageOne({ status: "sent" })

    expect((await sign(token, "عميل مُسلِّم")).error).toBeUndefined()

    // No admin pressed anything. Waiting on one is exactly how the rep ends up
    // signing in the customer's box instead.
    const child = await loadChild(sigId)
    expect(child?.signatoryRole).toBe("kara_agent")
    expect(await getPendingAgentCountersignToken(sigId)).toBe(child?.secureToken)
  })

  test("stays out of a delivery, which has no Kara-side signature to collect", async () => {
    const { sigId, token } = await seedSignedStageOne({
      typeId: DELIVERY_TYPE,
      status: "sent",
    })

    expect((await sign(token, "مستلم الشركة")).error).toBeUndefined()

    expect(await loadChild(sigId)).toBeNull()
  })

  test("the rep's own signature never re-chains a third stage", async () => {
    const { sigId, token } = await seedSignedStageOne({ status: "sent" })
    await sign(token, "عميل مُسلِّم")
    const child = await loadChild(sigId)

    expect((await sign(child!.secureToken, "احمد محمد")).error).toBeUndefined()

    const [grandchild] = await db
      .select()
      .from(schema.signatureRequests)
      .where(eq(schema.signatureRequests.parentSignatureRequestId, child!.id))
    expect(grandchild).toBeUndefined()
  })
})
