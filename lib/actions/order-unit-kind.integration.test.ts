// saveOrderUnits must keep order_unit.kind in step with the line each unit
// points at. The bulk Devices editor can re-point a unit at a different line of
// the same order; before this was enforced, kind survived the move and left a
// unit contradicting its own line — the order-10692 defect, reachable from the
// UI with no script involved.
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
import { findAssetKindLineTypeMismatches } from "@/lib/db/invariants"

const ADMIN_ID = "admin-user-kind-itest"

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
let saveOrderUnits: typeof import("@/lib/actions/orders").saveOrderUnits

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "order-unit-kind-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db
    .insert(schema.users)
    .values({ id: ADMIN_ID, name: "Admin", email: "admin@kind-itest.local", role: "admin" })
  ;({ saveOrderUnits } = await import("@/lib/actions/orders"))
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// One order carrying both line types — the mix that makes re-pointing possible.
async function seedMixedOrder(orderNumber: string) {
  const customerId = createId()
  const orderId = createId()
  const rentalLineId = createId()
  const saleLineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId })
  await db.insert(schema.orderLines).values([
    { id: rentalLineId, orderId, description: "iPad A16", quantity: 2, type: "rental_asset" },
    { id: saleLineId, orderId, description: "Monitor", quantity: 2, type: "sold_product" },
  ])
  return { orderId, rentalLineId, saleLineId }
}

async function unitsOf(orderId: string) {
  return db
    .select({ id: schema.orderUnits.id, kind: schema.orderUnits.kind, lineId: schema.orderUnits.orderLineId })
    .from(schema.orderUnits)
    .where(eq(schema.orderUnits.orderId, orderId))
}

describe("saveOrderUnits kind derivation", () => {
  test("new units take their kind from the line they are created on", async () => {
    const { orderId, rentalLineId, saleLineId } = await seedMixedOrder("70001")

    const res = await saveOrderUnits(orderId, [
      { orderLineId: rentalLineId, serialNumber: "KIND-R1" },
      { orderLineId: saleLineId, serialNumber: "KIND-S1" },
    ] as never)
    expect(res).not.toHaveProperty("error")

    const units = await unitsOf(orderId)
    expect(units.find((u) => u.lineId === rentalLineId)?.kind).toBe("rental")
    expect(units.find((u) => u.lineId === saleLineId)?.kind).toBe("sale")
  })

  test("re-pointing a unit from a sale line to a rental line re-derives kind", async () => {
    const { orderId, rentalLineId, saleLineId } = await seedMixedOrder("70002")

    await saveOrderUnits(orderId, [{ orderLineId: saleLineId, serialNumber: "KIND-S2" }] as never)
    const [created] = await unitsOf(orderId)
    expect(created.kind).toBe("sale")

    const res = await saveOrderUnits(orderId, [
      { id: created.id, orderLineId: rentalLineId, serialNumber: "KIND-S2" },
    ] as never)
    expect(res).not.toHaveProperty("error")

    const [moved] = await unitsOf(orderId)
    expect(moved.lineId).toBe(rentalLineId)
    expect(moved.kind).toBe("rental")
    expect(await findAssetKindLineTypeMismatches(db)).toEqual([])
  })

  test("re-pointing the other way is symmetric", async () => {
    const { orderId, rentalLineId, saleLineId } = await seedMixedOrder("70003")

    await saveOrderUnits(orderId, [{ orderLineId: rentalLineId, serialNumber: "KIND-R3" }] as never)
    const [created] = await unitsOf(orderId)
    expect(created.kind).toBe("rental")

    await saveOrderUnits(orderId, [
      { id: created.id, orderLineId: saleLineId, serialNumber: "KIND-R3" },
    ] as never)

    const [moved] = await unitsOf(orderId)
    expect(moved.kind).toBe("sale")
    expect(await findAssetKindLineTypeMismatches(db)).toEqual([])
  })

  test("an edit that does not move the unit leaves kind alone", async () => {
    const { orderId, saleLineId } = await seedMixedOrder("70004")

    await saveOrderUnits(orderId, [{ orderLineId: saleLineId, serialNumber: "KIND-S4" }] as never)
    const [created] = await unitsOf(orderId)

    await saveOrderUnits(orderId, [
      { id: created.id, orderLineId: saleLineId, serialNumber: "KIND-S4", notes: "edited" },
    ] as never)

    const [same] = await unitsOf(orderId)
    expect(same.kind).toBe("sale")
  })
})
