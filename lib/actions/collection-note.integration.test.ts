// What the printed سند استلام carries, at the data layer.
// Proves the contract:
//   - a collection note exposes BOTH rental dates, not just the movement one;
//   - the Kara rep who collected is resolved from the covering partner task,
//     by either route (task.requestId column or the delivery-item bridge);
//   - cancelled tasks never get credited with the collection;
//   - a delivery note is untouched by any of it.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
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

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

import { getDeliveryNoteData } from "./delivery-notes"

const DELIVERY_TYPE = "type-delivery"
const COLLECTION_TYPE = "type-collection"

const DELIVERED_ON = Date.UTC(2026, 0, 15)
const COLLECTED_ON = Date.UTC(2026, 6, 15)

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "collection-note-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })

  await db.insert(schema.requestTypes).values([
    { id: DELIVERY_TYPE, slug: "delivery", nameEn: "Delivery", nameAr: "تسليم" },
    { id: COLLECTION_TYPE, slug: "collection", nameEn: "Collection", nameAr: "استلام" },
  ])
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A signed-nothing note over one request, returning its public token. */
async function seedNote({
  typeId,
  suffix,
}: {
  typeId: string
  suffix: string
}) {
  const customerId = createId()
  const requestId = createId()
  const itemId = createId()
  const token = `token-${suffix}`

  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${suffix}` })
  await db.insert(schema.requests).values({
    id: requestId,
    requestNumber: `REQ-${suffix}`,
    trackingCode: `TRK-${suffix}`,
    typeId,
    customerId,
    quoteNumber: `Q-${suffix}`,
    deliveryDate: DELIVERED_ON,
    collectionDate: COLLECTED_ON,
    status: "completed",
  })
  await db.insert(schema.requestItems).values({
    id: itemId,
    requestId,
    description: "Laptop",
    quantity: 1,
  })
  await db.insert(schema.signatureRequests).values({
    id: createId(),
    requestId,
    customerId,
    documentName: `Note ${suffix}`,
    secureToken: token,
    status: "sent",
  })
  return { customerId, requestId, itemId, token }
}

async function seedPartner(name: string, contactPerson: string | null) {
  const id = createId()
  await db.insert(schema.partners).values({ id, name, contactPerson })
  return id
}

async function seedTask({
  partnerId,
  requestId,
  status = "closed",
}: {
  partnerId: string
  requestId: string | null
  status?: "closed" | "cancelled"
}) {
  const id = createId()
  await db.insert(schema.partnerTasks).values({
    id,
    kind: "request",
    partnerId,
    requestId,
    status,
    taskToken: `task-${id}`,
    taskTokenExpiresAt: Date.UTC(2027, 0, 1),
  })
  return id
}

describe("collection note data", () => {
  test("carries both rental dates so the period reads off one page", async () => {
    const { token } = await seedNote({ typeId: COLLECTION_TYPE, suffix: "dates" })

    const data = await getDeliveryNoteData(token)

    expect(data?.request?.deliveryDate).toBe(DELIVERED_ON)
    expect(data?.request?.collectionDate).toBe(COLLECTED_ON)
    // movementDate is the date for THIS direction — the collection.
    expect(data?.request?.movementDate).toBe(COLLECTED_ON)
  })

  test("names the collecting rep from the task's own request column", async () => {
    const { requestId, token } = await seedNote({ typeId: COLLECTION_TYPE, suffix: "bycolumn" })
    const partnerId = await seedPartner("Swift Logistics", "Omar Nasser")
    await seedTask({ partnerId, requestId })

    const data = await getDeliveryNoteData(token)

    expect(data?.collectedBy).toBe("Omar Nasser — Swift Logistics")
  })

  test("finds the rep through the delivery-item bridge when the task spans requests", async () => {
    // Delivery Batching v2: one task covers several requests, so its own
    // requestId column is null and only the item bridge links them.
    const { itemId, token } = await seedNote({ typeId: COLLECTION_TYPE, suffix: "bridge" })
    const partnerId = await seedPartner("Batch Courier", null)
    const taskId = await seedTask({ partnerId, requestId: null })
    await db.insert(schema.deliveryTaskItems).values({
      id: createId(),
      partnerTaskId: taskId,
      requestItemId: itemId,
      qtyPlanned: 1,
    })

    const data = await getDeliveryNoteData(token)

    // No contact person on file — the company name stands alone.
    expect(data?.collectedBy).toBe("Batch Courier")
  })

  test("never credits a cancelled task with the collection", async () => {
    const { requestId, token } = await seedNote({ typeId: COLLECTION_TYPE, suffix: "cancelled" })
    const partnerId = await seedPartner("Dropped Courier", "Ghost")
    await seedTask({ partnerId, requestId, status: "cancelled" })

    const data = await getDeliveryNoteData(token)

    expect(data?.collectedBy).toBeNull()
  })

  test("leaves the rep blank when no task covers the request yet", async () => {
    const { token } = await seedNote({ typeId: COLLECTION_TYPE, suffix: "notask" })

    const data = await getDeliveryNoteData(token)

    expect(data?.collectedBy).toBeNull()
  })

  test("a delivery note resolves no collecting rep", async () => {
    const { requestId, token } = await seedNote({ typeId: DELIVERY_TYPE, suffix: "delivery" })
    const partnerId = await seedPartner("Outbound Courier", "Sara")
    await seedTask({ partnerId, requestId })

    const data = await getDeliveryNoteData(token)

    expect(data?.request?.typeSlug).toBe("delivery")
    expect(data?.collectedBy).toBeNull()
    expect(data?.request?.movementDate).toBe(DELIVERED_ON)
  })
})
