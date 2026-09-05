// A device we do not own must be enterable, serviceable, and invisible to every
// path that treats stock as ours to allocate. The expensive failure this guards
// is silent: a customer's laptop, left in our warehouse for a repair, showing up
// in the adopt-free-stock panel and going out on someone else's rental.
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
import { findOwnershipViolations } from "@/lib/db/invariants"

const ADMIN_ID = "admin-user-ownership-itest"

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
let createAssetCore: typeof import("@/lib/actions/assets").createAssetCore
let getAdoptableUnitsCore: typeof import("@/lib/actions/order-unit-adoption-core").getAdoptableUnitsCore
let applyAssetTransition: typeof import("@/lib/actions/asset-transition").applyAssetTransition

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "asset-ownership-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  holder.db = db
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
  await db
    .insert(schema.users)
    .values({ id: ADMIN_ID, name: "Admin", email: "admin@ownership-itest.local", role: "admin" })
  ;({ createAssetCore } = await import("@/lib/actions/assets"))
  ;({ getAdoptableUnitsCore } = await import("@/lib/actions/order-unit-adoption-core"))
  ;({ applyAssetTransition } = await import("@/lib/actions/asset-transition"))
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seedRentalOrder(orderNumber: string) {
  const customerId = createId()
  const orderId = createId()
  const lineId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: `Customer ${orderNumber}` })
  await db.insert(schema.orders).values({ id: orderId, orderNumber, customerId })
  await db
    .insert(schema.orderLines)
    .values({ id: lineId, orderId, description: "ThinkPad L14", quantity: 2, type: "rental_asset" })
  return { customerId, orderId, lineId }
}

async function unit(id: string) {
  const [row] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, id))
  return row
}

describe("entering a device we do not own", () => {
  test("a customer-owned device is created with no origin and no KARA tag", async () => {
    let assetId = ""
    await db.transaction(async (tx) => {
      ;({ assetId } = await createAssetCore(
        tx,
        { ownership: "customer", serialNumber: "own-cust-1", model: "MacBook Pro 14" },
        ADMIN_ID
      ))
    })

    const row = await unit(assetId)
    expect(row.ownership).toBe("customer")
    // The tag is our inventory identity — minting one here would stamp KARA on
    // property we do not own and pull it into every tag-keyed report.
    expect(row.assetTag).toBeNull()
    expect(row.orderLineId).toBeNull()
    expect(row.purchaseOrderLineId).toBeNull()
    expect(row.serialNumber).toBe("OWN-CUST-1")
  })

  test("a non-KARA device cannot be created from one of our order lines", async () => {
    const { lineId } = await seedRentalOrder("80001")
    await expect(
      db.transaction(async (tx) => {
        await createAssetCore(
          tx,
          { ownership: "customer", orderLineId: lineId, serialNumber: "own-cust-2" },
          ADMIN_ID
        )
      })
    ).rejects.toThrow()
  })

  test("a KARA device is unchanged: origin required, tag minted", async () => {
    const { lineId } = await seedRentalOrder("80002")
    let assetId = ""
    await db.transaction(async (tx) => {
      ;({ assetId } = await createAssetCore(tx, { orderLineId: lineId, serialNumber: "own-kara-1" }, ADMIN_ID))
    })
    const row = await unit(assetId)
    expect(row.ownership).toBe("kara")
    expect(row.assetTag).toMatch(/^KARA-\d{5}$/)
  })
})

describe("free stock excludes what is not ours", () => {
  test("a customer-owned device sitting in our warehouse is not adoptable", async () => {
    const { orderId } = await seedRentalOrder("80003")

    // Both devices are in_stock, rental, unallocated and origin-less. The only
    // thing separating them is ownership.
    let karaId = ""
    let customerId = ""
    await db.transaction(async (tx) => {
      ;({ assetId: karaId } = await createAssetCore(
        tx,
        { standalone: true, serialNumber: "own-free-kara", model: "ThinkPad L14" },
        ADMIN_ID
      ))
      ;({ assetId: customerId } = await createAssetCore(
        tx,
        { ownership: "customer", serialNumber: "own-free-cust", model: "ThinkPad L14" },
        ADMIN_ID
      ))
    })

    const adoptable = await db.transaction((tx) => getAdoptableUnitsCore(tx, orderId))
    const ids = adoptable.map((u) => u.unitId)
    expect(ids).toContain(karaId)
    expect(ids).not.toContain(customerId)
  })
})

describe("the transition chokepoint honours ownership", () => {
  test("a customer-owned device cannot be sold or retired through applyAssetTransition", async () => {
    let assetId = ""
    await db.transaction(async (tx) => {
      ;({ assetId } = await createAssetCore(
        tx,
        { ownership: "customer", serialNumber: "own-cust-3", model: "Latitude 5440" },
        ADMIN_ID
      ))
    })

    for (const action of ["sell", "retire"] as const) {
      await expect(
        db.transaction(async (tx) => {
          await applyAssetTransition(tx, assetId, action, { byUserId: ADMIN_ID })
        })
      ).rejects.toThrow(/owned by customer/)
    }
    expect((await unit(assetId)).status).toBe("in_stock")
  })

  test("but it can still be collected, serviced and handed back", async () => {
    const { customerId } = await seedRentalOrder("80004")
    let assetId = ""
    await db.transaction(async (tx) => {
      ;({ assetId } = await createAssetCore(
        tx,
        { ownership: "customer", serialNumber: "own-cust-4", model: "Latitude 5440" },
        ADMIN_ID
      ))
    })

    for (const action of ["assign", "deliver", "return", "send_maintenance", "repair_done"] as const) {
      await db.transaction(async (tx) => {
        await applyAssetTransition(tx, assetId, action, { byUserId: ADMIN_ID, customerId })
      })
    }
    expect((await unit(assetId)).status).toBe("in_stock")
  })
})

describe("findOwnershipViolations", () => {
  test("clean by construction, and catches a hand-written contradiction", async () => {
    expect(await findOwnershipViolations(db)).toEqual([])

    // Simulate what a repair script or a direct UPDATE could do: stamp a KARA
    // tag onto a device we do not own. No write path allows this, which is
    // exactly why the audit has to.
    let assetId = ""
    await db.transaction(async (tx) => {
      ;({ assetId } = await createAssetCore(
        tx,
        { ownership: "supplier", serialNumber: "own-sup-1", model: "ProBook 450" },
        ADMIN_ID
      ))
    })
    await db
      .update(schema.orderUnits)
      .set({ assetTag: "KARA-99999" })
      .where(eq(schema.orderUnits.id, assetId))

    const violations = await findOwnershipViolations(db)
    expect(violations).toHaveLength(1)
    expect(violations[0].id).toBe(assetId)
    expect(violations[0].reason).toBe("carries a KARA asset tag")

    await db
      .update(schema.orderUnits)
      .set({ assetTag: null })
      .where(eq(schema.orderUnits.id, assetId))
    expect(await findOwnershipViolations(db)).toEqual([])
  })
})
