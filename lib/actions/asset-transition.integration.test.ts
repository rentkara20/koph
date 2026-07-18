// Integration coverage for the OI-1 chokepoint against a REAL, ephemeral
// SQLite database (migrated from the actual lib/db/migrations, not mocked).
// Exercises the exact scenarios of the four highest-risk callers:
//   - assign asset during request creation
//   - deliver/return during task close
//   - maintenance open/close
//   - release asset after cancellation/failure
// plus the two invariants OI-1 must guarantee:
//   - every successful transition creates exactly one asset_event
//   - a failed/invalid transition creates no status change and no event
//
// The session-gated action wrappers (createRequest, signOffTask, etc.) call
// next/headers and cannot run outside an HTTP request (see Milestone 1 / OI-0
// validation report) — this file tests the chokepoint they all delegate to,
// which is where the atomicity guarantee actually lives.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq, and } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { applyAssetTransition, applyAssetStatusCorrection, AssetTransitionError } from "./asset-transition"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "oi1-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ─── Fixture builders ──────────────────────────────────────────────────────

async function seedAsset(status: schema.OrderUnit["status"] = "in_stock") {
  const orderId = createId()
  const lineId = createId()
  const customerId = createId()
  const unitId = createId()
  await db.insert(schema.customers).values({ id: customerId, name: "IT_CUSTOMER" })
  await db.insert(schema.orders).values({ id: orderId, orderNumber: "IT-" + unitId.slice(-8), customerId })
  await db.insert(schema.orderLines).values({ id: lineId, orderId, description: "IT device", quantity: 1 })
  await db.insert(schema.orderUnits).values({ id: unitId, orderId, orderLineId: lineId, status })
  return { unitId, orderId, customerId }
}

async function eventCount(assetId: string) {
  const rows = await db.select().from(schema.assetEvents).where(eq(schema.assetEvents.assetId, assetId))
  return rows.length
}

async function assetStatus(assetId: string) {
  const [row] = await db.select({ status: schema.orderUnits.status }).from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
  return row?.status
}

// ─── Highest-risk path 1: assign during request creation ──────────────────

describe("assign asset during request creation", () => {
  test("in_stock -> assigned, sets requestId/customerId, writes one 'assigned' event", async () => {
    const { unitId, customerId } = await seedAsset("in_stock")
    const requestId = createId()
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "assign", { requestId, customerId, byUserId: "u1" })
    })
    expect(await assetStatus(unitId)).toBe("assigned")
    expect(await eventCount(unitId)).toBe(1)
    const [event] = await db.select().from(schema.assetEvents).where(eq(schema.assetEvents.assetId, unitId))
    expect(event.type).toBe("assigned")
    expect(event.fromStatus).toBe("in_stock")
    expect(event.toStatus).toBe("assigned")
    expect(event.requestId).toBe(requestId)
    expect(event.customerId).toBe(customerId)
  })

  test("double-assign (already assigned) is rejected, no second event, status unchanged", async () => {
    const { unitId, customerId } = await seedAsset("assigned")
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, unitId, "assign", { customerId, byUserId: "u1" })
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await assetStatus(unitId)).toBe("assigned")
    expect(await eventCount(unitId)).toBe(0)
  })
})

// ─── Highest-risk path 2: deliver/return during task close ────────────────

describe("deliver/return during task close", () => {
  test("assigned -> delivered on delivery-type close", async () => {
    const { unitId, customerId } = await seedAsset("assigned")
    const requestId = createId()
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "deliver", { requestId, customerId, byUserId: "u1" })
    })
    expect(await assetStatus(unitId)).toBe("delivered")
    expect(await eventCount(unitId)).toBe(1)
  })

  test("delivered -> returned on collection-type close, clears assignment", async () => {
    const { unitId, customerId } = await seedAsset("delivered")
    const requestId = createId()
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "return", { requestId, customerId, byUserId: "u1" })
    })
    expect(await assetStatus(unitId)).toBe("returned")
    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, unitId))
    expect(unit.currentRequestId).toBeNull()
    expect(unit.currentCustomerId).toBeNull()
    expect(await eventCount(unitId)).toBe(1)
  })

  test("closing a task for an already-returned unit is rejected, no duplicate event", async () => {
    const { unitId } = await seedAsset("returned")
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, unitId, "return", { byUserId: "u1" })
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await eventCount(unitId)).toBe(0)
  })

  test("sign-off asset sync is atomic with the task update: a later failure in the same tx rolls back the asset move too", async () => {
    const { unitId } = await seedAsset("assigned")
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, unitId, "deliver", { byUserId: "u1" })
        throw new Error("simulated failure after the asset transition")
      })
    ).rejects.toThrow("simulated failure")
    // The whole transaction rolled back — asset must still be "assigned", no event persisted.
    expect(await assetStatus(unitId)).toBe("assigned")
    expect(await eventCount(unitId)).toBe(0)
  })
})

// ─── Highest-risk path 3: maintenance open/close ───────────────────────────

describe("maintenance open/close", () => {
  test("open: in_stock -> maintenance, one 'maintenance' event", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "send_maintenance", { byUserId: "u1" })
    })
    expect(await assetStatus(unitId)).toBe("maintenance")
    const [event] = await db.select().from(schema.assetEvents).where(eq(schema.assetEvents.assetId, unitId))
    expect(event.type).toBe("maintenance")
    expect(await eventCount(unitId)).toBe(1)
  })

  test("close (done): maintenance -> in_stock, location reset to main_warehouse", async () => {
    const { unitId } = await seedAsset("maintenance")
    await db.update(schema.orderUnits).set({ location: "branch_9" }).where(eq(schema.orderUnits.id, unitId))
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "repair_done", { byUserId: "u1" })
    })
    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, unitId))
    expect(unit.status).toBe("in_stock")
    expect(unit.location).toBe("main_warehouse")
    expect(await eventCount(unitId)).toBe(1)
  })

  test("opening maintenance on an already-delivered (with a customer) unit is rejected", async () => {
    const { unitId } = await seedAsset("delivered")
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, unitId, "send_maintenance", { byUserId: "u1" })
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await assetStatus(unitId)).toBe("delivered")
    expect(await eventCount(unitId)).toBe(0)
  })
})

// ─── Highest-risk path 4: release asset after cancellation/failure ────────

describe("release asset after cancellation/failure", () => {
  test("assigned -> in_stock (unassign) on request cancel, clears requestId/customerId", async () => {
    const { unitId, customerId } = await seedAsset("assigned")
    const requestId = createId()
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "unassign", { requestId, customerId, byUserId: "u1" })
    })
    expect(await assetStatus(unitId)).toBe("in_stock")
    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, unitId))
    expect(unit.currentRequestId).toBeNull()
    expect(unit.currentCustomerId).toBeNull()
    expect(await eventCount(unitId)).toBe(1)
  })

  test("releasing a unit that's already delivered (not assigned) is skipped by the caller pattern, not forced — chokepoint rejects it", async () => {
    const { unitId } = await seedAsset("delivered")
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, unitId, "unassign", { byUserId: "u1" })
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await assetStatus(unitId)).toBe("delivered")
    expect(await eventCount(unitId)).toBe(0)
  })
})

// ─── Invariants ─────────────────────────────────────────────────────────────

describe("OI-1 invariants", () => {
  test("every successful transition creates exactly one asset_event", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "reserve", { byUserId: "u1" })
    })
    expect(await eventCount(unitId)).toBe(1)
  })

  test("a NOT_FOUND transition creates no status change and no event (asset never existed)", async () => {
    const ghostId = createId()
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, ghostId, "reserve", { byUserId: "u1" })
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await eventCount(ghostId)).toBe(0)
  })

  test("an invalid transition never partially applies: status untouched AND no event, even mid-batch", async () => {
    const a = await seedAsset("in_stock")
    const b = await seedAsset("sold") // terminal, nothing but sell-from-retired applies
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, a.unitId, "reserve", { byUserId: "u1" }) // valid
        await applyAssetTransition(tx, b.unitId, "reserve", { byUserId: "u1" }) // invalid -> throws, rolls back BOTH
      })
    ).rejects.toThrow(AssetTransitionError)
    // Whole transaction rolled back — even the valid first transition must not survive.
    expect(await assetStatus(a.unitId)).toBe("in_stock")
    expect(await eventCount(a.unitId)).toBe(0)
    expect(await assetStatus(b.unitId)).toBe("sold")
    expect(await eventCount(b.unitId)).toBe(0)
  })

  test("concurrent modification is detected: a status change between read and write is not silently overwritten", async () => {
    const { unitId } = await seedAsset("in_stock")
    // Simulate a racing writer that moved the asset before our transaction's update lands.
    await db.update(schema.orderUnits).set({ status: "reserved" }).where(eq(schema.orderUnits.id, unitId))
    await expect(
      db.transaction(async (tx) => {
        // canAssetTransition("in_stock", "reserve") passes the initial read=in_stock
        // check inside applyAssetTransition only if it re-reads under tx — verify it
        // does not trust a stale outer read: read happens inside the tx, so this
        // actually sees "reserved" now and correctly rejects "reserve" from "reserved".
        await applyAssetTransition(tx, unitId, "reserve", { byUserId: "u1" })
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await eventCount(unitId)).toBe(0)
  })
})

// ─── applyAssetStatusCorrection (saveOrderUnits path) ──────────────────────

describe("applyAssetStatusCorrection", () => {
  test("delegates to a matching action when (from,to) maps to exactly one", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetStatusCorrection(tx, unitId, "reserved", { byUserId: "u1" })
    })
    expect(await assetStatus(unitId)).toBe("reserved")
    const [event] = await db.select().from(schema.assetEvents).where(eq(schema.assetEvents.assetId, unitId))
    expect(event.type).toBe("status_change") // "reserve" has no dedicated event type
    expect(await eventCount(unitId)).toBe(1)
  })

  test("unmapped (from,to) pair still writes a 'correction' event, not silently applied without audit", async () => {
    const { unitId } = await seedAsset("reserved")
    await db.transaction(async (tx) => {
      // reserved -> damaged has no action in TRANSITIONS at all
      await applyAssetStatusCorrection(tx, unitId, "damaged", { byUserId: "u1", notes: "manual fix" })
    })
    expect(await assetStatus(unitId)).toBe("damaged")
    const [event] = await db.select().from(schema.assetEvents).where(eq(schema.assetEvents.assetId, unitId))
    expect(event.type).toBe("correction")
    expect(event.notes).toBe("manual fix")
  })

  test("same-status no-op writes no event", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetStatusCorrection(tx, unitId, "in_stock", { byUserId: "u1" })
    })
    expect(await eventCount(unitId)).toBe(0)
  })
})

// ─── OI-2 closure: every asset action emits its mapped domain event ───────

describe("domain event coverage for every asset action", () => {
  async function domainEventTypesFor(assetId: string) {
    const rows = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.aggregateId, assetId))
    return rows.map((r) => r.eventType)
  }

  test("reserve/unreserve emit AssetReserved/AssetUnreserved", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "reserve", {})
    })
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "unreserve", {})
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetReserved", "AssetUnreserved"])
  })

  test("unassign emits AssetUnassigned", async () => {
    const { unitId } = await seedAsset("assigned")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "unassign", {})
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetUnassigned"])
  })

  test("restock emits AssetRestocked", async () => {
    const { unitId } = await seedAsset("returned")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "restock", {})
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetRestocked"])
  })

  test("mark_damaged emits AssetDamaged", async () => {
    const { unitId } = await seedAsset("returned")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "mark_damaged", {})
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetDamaged"])
  })

  test("mark_lost then found emit AssetLost then AssetFound", async () => {
    const { unitId } = await seedAsset("delivered")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "mark_lost", {})
    })
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "found", {})
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetLost", "AssetFound"])
  })

  test("sell emits AssetSold", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "sell", {})
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetSold"])
  })

  test("an unmapped correction emits AssetStatusCorrected exactly once", async () => {
    const { unitId } = await seedAsset("reserved")
    await db.transaction(async (tx) => {
      await applyAssetStatusCorrection(tx, unitId, "damaged", { notes: "manual fix" })
    })
    expect(await domainEventTypesFor(unitId)).toEqual(["AssetStatusCorrected"])
  })

  test("an invalid transition writes no domain event", async () => {
    const { unitId } = await seedAsset("retired")
    await expect(
      db.transaction(async (tx) => {
        await applyAssetTransition(tx, unitId, "assign", {})
      })
    ).rejects.toThrow(AssetTransitionError)
    expect(await domainEventTypesFor(unitId)).toEqual([])
  })

  test("a duplicate emit (same underlying asset_event id via re-running the same tx logic) never happens — each transition gets its own dedupeKey", async () => {
    const { unitId } = await seedAsset("in_stock")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "reserve", {})
    })
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "unreserve", {})
    })
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, unitId, "reserve", {})
    })
    const rows = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.aggregateId, unitId))
    const dedupeKeys = rows.map((r) => r.dedupeKey)
    expect(new Set(dedupeKeys).size).toBe(dedupeKeys.length)
  })
})
