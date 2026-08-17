// The requests list's quick views and per-row enrichment are the only place
// that answers "which jobs have nobody on them?" and "which are late?". Both
// are raw-SQL heavy — exists subqueries with hand-written table names, and a
// two-signal task lookup that a batched task can satisfy twice — so they are
// exercised against a real migrated SQLite file rather than mocked.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { asc } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { parseRiyadhDate } from "@/lib/utils/format"
import { enrichRequestRows, requestViewCondition } from "./request-list"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

// A fixed "now" so the overdue/today boundaries are deterministic; every
// fixture date below is expressed relative to it.
const TODAY = "2026-08-16"
const NOW = parseRiyadhDate(TODAY)! + 9 * 3_600_000 // 09:00 Riyadh
const day = (d: string) => parseRiyadhDate(d)!

const TYPE_DELIVERY = "type-delivery"
const TYPE_COLLECTION = "type-collection"
const CUSTOMER = "cust-1"
const PARTNER_A = "partner-a"
const PARTNER_B = "partner-b"

let requestNo = 0
async function seedRequest(input: {
  id: string
  status: (typeof schema.requests.$inferInsert)["status"]
  deliveryDate?: number | null
  collectionDate?: number | null
  typeId?: string
}) {
  requestNo += 1
  await db.insert(schema.requests).values({
    id: input.id,
    requestNumber: `KR-2026-${String(requestNo).padStart(5, "0")}`,
    trackingCode: `TRK${requestNo}`,
    typeId: input.typeId ?? TYPE_DELIVERY,
    customerId: CUSTOMER,
    status: input.status,
    deliveryDate: input.deliveryDate ?? null,
    collectionDate: input.collectionDate ?? null,
  })
}

let tokenNo = 0
async function seedTask(input: {
  id: string
  partnerId: string
  requestId?: string | null
  status?: (typeof schema.partnerTasks.$inferInsert)["status"]
}) {
  tokenNo += 1
  await db.insert(schema.partnerTasks).values({
    id: input.id,
    requestId: input.requestId ?? null,
    partnerId: input.partnerId,
    taskToken: `tok-${tokenNo}`,
    taskTokenExpiresAt: NOW + 86_400_000,
    status: input.status ?? "pending",
  })
}

async function seedItem(id: string, requestId: string, quantity: number) {
  await db.insert(schema.requestItems).values({ id, requestId, description: "Laptop", quantity })
}

async function idsFor(view: Parameters<typeof requestViewCondition>[0]) {
  const rows = await db
    .select({ id: schema.requests.id })
    .from(schema.requests)
    .where(requestViewCondition(view, NOW))
    .orderBy(asc(schema.requests.id))
  return rows.map((r) => r.id)
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "request-list-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })

  await db.insert(schema.requestTypes).values([
    { id: TYPE_DELIVERY, slug: "delivery", nameEn: "Delivery", nameAr: "توصيل" },
    { id: TYPE_COLLECTION, slug: "collection", nameEn: "Collection", nameAr: "استلام" },
  ])
  await db.insert(schema.customers).values({ id: CUSTOMER, name: "JeelPay" })
  await db.insert(schema.partners).values([
    { id: PARTNER_A, name: "Partner A" },
    { id: PARTNER_B, name: "Partner B" },
  ])
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("requestViewCondition", () => {
  it("lists only open requests that no task reaches, by either signal", async () => {
    // r-open-none: nothing assigned → the whole point of the view.
    await seedRequest({ id: "r-open-none", status: "draft", deliveryDate: day("2026-08-20") })
    // r-open-direct: reached by the task's own request_id.
    await seedRequest({ id: "r-open-direct", status: "assigned", deliveryDate: day("2026-08-20") })
    await seedTask({ id: "t-direct", partnerId: PARTNER_A, requestId: "r-open-direct" })
    // r-open-batched: reached ONLY through delivery_task_item, the signal a
    // naive `partner_task.request_id is null` check would miss entirely.
    await seedRequest({ id: "r-open-batched", status: "assigned", deliveryDate: day("2026-08-20") })
    await seedItem("i-batched", "r-open-batched", 1)
    await seedTask({ id: "t-batched", partnerId: PARTNER_A, requestId: null })
    await db.insert(schema.deliveryTaskItems).values({
      id: "dti-1",
      partnerTaskId: "t-batched",
      requestItemId: "i-batched",
      qtyPlanned: 1,
    })
    // Closed requests are history, not a worklist, even with no task.
    await seedRequest({ id: "r-closed-none", status: "completed" })
    await seedRequest({ id: "r-cancelled-none", status: "cancelled" })

    expect(await idsFor("unassigned")).toEqual(["r-open-none"])
  })

  it("treats a request as overdue only when it is open and its date has passed", async () => {
    await seedRequest({ id: "v-late", status: "assigned", deliveryDate: day("2026-08-14") })
    await seedRequest({ id: "v-late-yesterday", status: "draft", deliveryDate: day("2026-08-15") })
    // Same calendar day is not late, even though NOW is 09:00 into it.
    await seedRequest({ id: "v-today", status: "assigned", deliveryDate: day(TODAY) })
    await seedRequest({ id: "v-future", status: "assigned", deliveryDate: day("2026-08-20") })
    // Past date but already closed — must not be flagged.
    await seedRequest({ id: "v-late-done", status: "completed", deliveryDate: day("2026-08-01") })
    await seedRequest({ id: "v-late-failed", status: "failed", deliveryDate: day("2026-08-01") })
    // No date at all cannot be late.
    await seedRequest({ id: "v-undated", status: "assigned", deliveryDate: null })
    // Collection requests date from collection_date; ignoring it would hide
    // every late collection from the view.
    await seedRequest({
      id: "v-late-collection",
      status: "assigned",
      typeId: TYPE_COLLECTION,
      collectionDate: day("2026-08-10"),
    })

    expect(await idsFor("overdue")).toEqual([
      "v-late",
      "v-late-collection",
      "v-late-yesterday",
    ])
  })

  it("scopes 'today' to the Riyadh calendar day, not the next 24 hours", async () => {
    const ids = await idsFor("today")
    expect(ids).toContain("v-today")
    expect(ids).not.toContain("v-future")
    expect(ids).not.toContain("v-late")

    // The last minute of the Riyadh day still counts as today; the first
    // instant of the next one does not.
    await seedRequest({
      id: "v-today-late",
      status: "assigned",
      deliveryDate: day(TODAY) + 86_399_000,
    })
    await seedRequest({
      id: "v-tomorrow-zero",
      status: "assigned",
      deliveryDate: day("2026-08-17"),
    })
    const after = await idsFor("today")
    expect(after).toContain("v-today-late")
    expect(after).not.toContain("v-tomorrow-zero")
  })

  it("flags completed requests with no signed signature", async () => {
    await seedRequest({ id: "s-none", status: "completed" })
    await seedRequest({ id: "s-pending", status: "completed" })
    await seedRequest({ id: "s-signed", status: "completed" })
    // Not completed yet — a signature is not due, so it must not appear.
    await seedRequest({ id: "s-inprogress", status: "in_progress" })
    await db.insert(schema.signatureRequests).values([
      {
        id: "sig-pending",
        requestId: "s-pending",
        customerId: CUSTOMER,
        documentName: "Delivery note",
        secureToken: "sig-tok-1",
        status: "sent",
      },
      {
        id: "sig-signed",
        requestId: "s-signed",
        customerId: CUSTOMER,
        documentName: "Delivery note",
        secureToken: "sig-tok-2",
        status: "signed",
      },
    ])

    const ids = await idsFor("needs_signature")
    expect(ids).toContain("s-none")
    expect(ids).toContain("s-pending")
    expect(ids).not.toContain("s-signed")
    expect(ids).not.toContain("s-inprogress")
  })
})

describe("enrichRequestRows", () => {
  it("returns an empty map without querying when given no ids", async () => {
    expect(await enrichRequestRows(db, [])).toEqual(new Map())
  })

  it("gives every requested id an entry, even one with nothing attached", async () => {
    const map = await enrichRequestRows(db, ["r-open-none"])
    expect(map.get("r-open-none")).toEqual({
      partnerNames: [],
      taskCount: 0,
      itemCount: 0,
      itemQuantity: 0,
      hasPendingSignoff: false,
      hasSignedSignature: false,
      hasAnySignature: false,
    })
  })

  it("counts a task reached by both signals exactly once", async () => {
    // The realistic shape: a task carries request_id AND has a
    // delivery_task_item pointing back at the same request. Merging the two
    // result sets without deduping reports taskCount 2 and "Partner A +1".
    await seedRequest({ id: "e-both", status: "assigned" })
    await seedItem("e-both-item", "e-both", 3)
    await seedTask({ id: "t-both", partnerId: PARTNER_A, requestId: "e-both" })
    await db.insert(schema.deliveryTaskItems).values({
      id: "dti-both",
      partnerTaskId: "t-both",
      requestItemId: "e-both-item",
      qtyPlanned: 3,
    })

    const row = (await enrichRequestRows(db, ["e-both"])).get("e-both")!
    expect(row.taskCount).toBe(1)
    expect(row.partnerNames).toEqual(["Partner A"])
  })

  it("lists distinct partners and flags a task awaiting sign-off", async () => {
    await seedRequest({ id: "e-multi", status: "in_progress" })
    await seedTask({ id: "t-m1", partnerId: PARTNER_A, requestId: "e-multi" })
    // Same partner on a second trip must not become "Partner A +1".
    await seedTask({ id: "t-m2", partnerId: PARTNER_A, requestId: "e-multi" })
    await seedTask({
      id: "t-m3",
      partnerId: PARTNER_B,
      requestId: "e-multi",
      status: "pending_signoff",
    })

    const row = (await enrichRequestRows(db, ["e-multi"])).get("e-multi")!
    expect(row.taskCount).toBe(3)
    expect(row.partnerNames.sort()).toEqual(["Partner A", "Partner B"])
    expect(row.hasPendingSignoff).toBe(true)
  })

  it("sums item quantity separately from the item row count", async () => {
    // 2 lines / 7 devices: the list shows the device total, which is what makes
    // a 1-device job visually different from a 40-device one.
    await seedRequest({ id: "e-items", status: "draft" })
    await seedItem("e-i1", "e-items", 5)
    await seedItem("e-i2", "e-items", 2)

    const row = (await enrichRequestRows(db, ["e-items"])).get("e-items")!
    expect(row.itemCount).toBe(2)
    expect(row.itemQuantity).toBe(7)
  })

  it("reports signature presence and signed-ness independently", async () => {
    const map = await enrichRequestRows(db, ["s-none", "s-pending", "s-signed"])
    expect(map.get("s-none")).toMatchObject({ hasAnySignature: false, hasSignedSignature: false })
    expect(map.get("s-pending")).toMatchObject({ hasAnySignature: true, hasSignedSignature: false })
    expect(map.get("s-signed")).toMatchObject({ hasAnySignature: true, hasSignedSignature: true })
  })

  it("keeps each request's enrichment separate across a batch", async () => {
    const map = await enrichRequestRows(db, ["e-items", "e-multi", "r-open-none"])
    expect(map.get("e-items")!.taskCount).toBe(0)
    expect(map.get("e-multi")!.itemQuantity).toBe(0)
    expect(map.get("r-open-none")!.partnerNames).toEqual([])
  })
})
