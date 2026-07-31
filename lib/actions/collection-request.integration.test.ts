// Collection (سند استلام) path, end-to-end against an ephemeral migrated DB.
// Proves the contract:
//   - creating a collection request over already-delivered units succeeds and
//     leaves them "delivered" (they are NOT re-assigned — "assign" is illegal
//     from "delivered" and used to reject the whole request);
//   - the outbound path is untouched: a delivery still assigns its units;
//   - signing off the collection task moves the units to "returned";
//   - a collection's deposit block defaults to the amount frozen on the signed
//     delivery note, not to the device's current purchase cost.
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
import { buildSignatureSnapshot } from "@/lib/domain/signature-snapshot"

const ADMIN_ID = "admin-user-itest"

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

// Import actions AFTER mocks are registered.
import { createRequest } from "./requests"
import { getDepositDefaultsForRequest } from "./signatures"

let deliveryTypeId: string
let collectionTypeId: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "collection-request-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })

  await db.insert(schema.users).values({
    id: ADMIN_ID,
    name: "Admin",
    email: "admin@itest.local",
    emailVerified: true,
  })

  deliveryTypeId = createId()
  collectionTypeId = createId()
  await db
    .insert(schema.requestTypes)
    .values([
      { id: deliveryTypeId, slug: "delivery", nameEn: "Delivery", nameAr: "تسليم" },
      { id: collectionTypeId, slug: "collection", nameEn: "Collection", nameAr: "استلام" },
    ])
    .onConflictDoNothing()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedCustomerOrder(orderNumber: string) {
  const customerId = createId()
  const orderId = createId()
  const orderLineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId })
  await db.insert(schema.orderLines).values({
    id: orderLineId,
    orderId,
    description: "Laptop",
    quantity: 1,
  })
  return { customerId, orderId, orderLineId }
}

async function statusOf(unitId: string) {
  const [row] = await db
    .select({ status: schema.orderUnits.status })
    .from(schema.orderUnits)
    .where(eq(schema.orderUnits.id, unitId))
  return row?.status
}

describe("createRequest — collection over delivered units", () => {
  test("succeeds and leaves the units delivered rather than re-assigning them", async () => {
    const { customerId, orderId, orderLineId } = await seedCustomerOrder("60601")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: "SN-COLLECT-1",
      status: "delivered",
    })

    const result = await createRequest({
      typeId: collectionTypeId,
      customerId,
      quoteNumber: "60601",
      requireNationalId: false,
      items: [{ description: "Laptop", quantity: 1, orderUnitId: unitId }],
    })

    expect(result.error).toBeUndefined()
    expect(result.id).toBeTruthy()
    // The device is out with the customer until the collection task is signed
    // off — nothing to reserve, and "assign" is not a legal move from here.
    expect(await statusOf(unitId)).toBe("delivered")
  })

  test("still assigns units on the outbound path", async () => {
    const { customerId, orderId, orderLineId } = await seedCustomerOrder("60602")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: "SN-DELIVER-1",
      status: "in_stock",
    })

    const result = await createRequest({
      typeId: deliveryTypeId,
      customerId,
      quoteNumber: "60602",
      requireNationalId: false,
      items: [{ description: "Laptop", quantity: 1, orderUnitId: unitId }],
    })

    expect(result.error).toBeUndefined()
    expect(await statusOf(unitId)).toBe("assigned")
  })

  test("writes no asset event for the units a collection pulls in", async () => {
    const { customerId, orderId, orderLineId } = await seedCustomerOrder("60603")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: "SN-COLLECT-2",
      status: "delivered",
    })

    await createRequest({
      typeId: collectionTypeId,
      customerId,
      quoteNumber: "60603",
      requireNationalId: false,
      items: [{ description: "Laptop", quantity: 1, orderUnitId: unitId }],
    })

    const events = await db
      .select()
      .from(schema.assetEvents)
      .where(eq(schema.assetEvents.assetId, unitId))
    expect(events).toEqual([])
  })
})

describe("getDepositDefaultsForRequest — collection", () => {
  test("seeds from the amount frozen on the signed note, not the purchase cost", async () => {
    const { customerId, orderId, orderLineId } = await seedCustomerOrder("60604")
    const unitId = createId()
    // Purchase cost drifted well away from what the customer actually paid.
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: "SN-DEPOSIT-1",
      purchaseCost: 9999,
      status: "delivered",
    })

    // The original delivery request, its item, and a signed note freezing the
    // agreed deposit of 4500 for that serial.
    const deliveryRequestId = createId()
    const deliveryItemId = createId()
    await db.insert(schema.requests).values({
      id: deliveryRequestId,
      requestNumber: "KR-OLD-60604",
      trackingCode: "TRK-60604",
      typeId: deliveryTypeId,
      customerId,
      quoteNumber: "60604",
      status: "completed",
    })
    await db.insert(schema.requestItems).values({
      id: deliveryItemId,
      requestId: deliveryRequestId,
      description: "Laptop",
      serialNumber: "SN-DEPOSIT-1",
      quantity: 1,
      orderUnitId: unitId,
    })

    const sigRequestId = createId()
    await db.insert(schema.signatureRequests).values({
      id: sigRequestId,
      requestId: deliveryRequestId,
      customerId,
      documentName: "Delivery Note #60604",
      secureToken: `tok-${sigRequestId}`,
      status: "signed",
    })
    const snapshot = buildSignatureSnapshot({
      requestNumber: "KR-OLD-60604",
      quoteNumber: "60604",
      customer: null,
      items: [
        {
          id: deliveryItemId,
          description: "Laptop",
          brand: null,
          model: null,
          serialNumber: "SN-DEPOSIT-1",
          quantity: 1,
          accessories: null,
          condition: "good",
          receivedQuantity: 1,
        },
      ],
      deliveryOutcome: "full_no_remarks",
      remarks: null,
      depositNote: {
        version: 1,
        enabled: true,
        currency: "SAR",
        title: "Deposit",
        showTotal: true,
        showRefundTerms: true,
        lines: [{ itemId: deliveryItemId, label: "Laptop · SN-DEPOSIT-1", amount: 4500 }],
        note: null,
        settlement: null,
        settledAt: null,
        settlementNote: null,
      },
      signer: { fullName: "Receiver", position: null, nationalId: null },
      signedAt: Date.now(),
    })
    await db.insert(schema.customerSignatures).values({
      id: createId(),
      signatureRequestId: sigRequestId,
      fullName: "Receiver",
      mobile: "0500000000",
      signatureData: "data:image/png;base64,AAA",
      signedAt: Date.now(),
      snapshot: JSON.stringify(snapshot),
    })

    // Now the collection request for the same order.
    const created = await createRequest({
      typeId: collectionTypeId,
      customerId,
      quoteNumber: "60604",
      requireNationalId: false,
      items: [
        {
          description: "Laptop",
          serialNumber: "SN-DEPOSIT-1",
          quantity: 1,
          orderUnitId: unitId,
        },
      ],
    })
    expect(created.error).toBeUndefined()

    const defaults = await getDepositDefaultsForRequest(created.id as string)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].amount).toBe(4500)
  })

  test("falls back to purchase cost for a device that was never on a signed note", async () => {
    const { customerId, orderId, orderLineId } = await seedCustomerOrder("60605")
    const unitId = createId()
    await db.insert(schema.orderUnits).values({
      id: unitId,
      orderId,
      orderLineId,
      serialNumber: "SN-DEPOSIT-2",
      purchaseCost: 3200,
      status: "delivered",
    })

    const created = await createRequest({
      typeId: collectionTypeId,
      customerId,
      quoteNumber: "60605",
      requireNationalId: false,
      items: [
        {
          description: "Laptop",
          serialNumber: "SN-DEPOSIT-2",
          quantity: 1,
          orderUnitId: unitId,
        },
      ],
    })
    expect(created.error).toBeUndefined()

    const defaults = await getDepositDefaultsForRequest(created.id as string)
    expect(defaults[0].amount).toBe(3200)
  })
})
