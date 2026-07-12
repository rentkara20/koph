// Integration coverage for Milestone 3 / P4 procurement receiving:
// receivePurchaseOrderLineCore atomically creates an Asset (via the same
// createAssetCore chokepoint used by the client order-line flow), increments
// qtyReceived, recomputes PO status, and emits PurchaseOrderLineReceived.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "procurement-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedPurchaseOrder(qtyOrdered = 1) {
  const supplierId = createId()
  const poId = createId()
  const lineId = createId()
  const procurementCaseId = createId()
  await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_SUPPLIER" })
  // Every purchase_order requires a procurement_case (M4.5 anchor) — seed a
  // bare system_manual case directly, this suite isn't testing that wiring.
  await db.insert(schema.procurementCases).values({ id: procurementCaseId, source: "system_manual" })
  await db.insert(schema.purchaseOrders).values({
    id: poId,
    supplierId,
    poNumber: "PO-" + lineId.slice(-8),
    status: "ordered",
    procurementCaseId,
  })
  await db.insert(schema.purchaseOrderLines).values({
    id: lineId,
    purchaseOrderId: poId,
    itemDescription: "IT laptop",
    qtyOrdered,
  })
  return { poId, lineId }
}

describe("receivePurchaseOrderLineCore", () => {
  test("creates an asset with purchaseOrderLineId origin, no client order-line", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineId } = await seedPurchaseOrder(1)

    let assetId = ""
    await db.transaction(async (tx) => {
      const result = await receivePurchaseOrderLineCore(
        tx,
        { purchaseOrderLineId: lineId, serialNumber: "PO-SN-001" },
        "u1"
      )
      assetId = result.assetId
    })

    const [unit] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    expect(unit.purchaseOrderLineId).toBe(lineId)
    expect(unit.orderLineId).toBeNull()
    expect(unit.serialNumber).toBe("PO-SN-001")

    const [line] = await db.select().from(schema.purchaseOrderLines).where(eq(schema.purchaseOrderLines.id, lineId))
    expect(line.qtyReceived).toBe(1)
  })

  test("marks PO received once every line is fully received", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { poId, lineId } = await seedPurchaseOrder(1)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-002" }, "u1")
    })

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("received")
  })

  test("marks PO partially_received when only some units are in", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { poId, lineId } = await seedPurchaseOrder(2)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-003" }, "u1")
    })

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("partially_received")
  })

  test("rejects receiving more than ordered, no row inserted", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineId } = await seedPurchaseOrder(1)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-004" }, "u1")
    })
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-SN-005" }, "u1")
      })
    ).rejects.toThrow("Cannot receive more than ordered")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })

  test("rejects a duplicate serial number across origins, no row inserted", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineId: lineA } = await seedPurchaseOrder(2)
    const { lineId: lineB } = await seedPurchaseOrder(2)

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineA, serialNumber: "PO-SN-DUP" }, "u1")
    })
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineB, serialNumber: "PO-SN-DUP" }, "u1")
      })
    ).rejects.toThrow("Serial number already in use")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })

  test("procurement asset is visible via the assets list join (leftJoin + coalesced origin)", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const { sql, eq, desc, and } = await import("drizzle-orm")
    const { lineId } = await seedPurchaseOrder(1)

    let assetId = ""
    await db.transaction(async (tx) => {
      const r = await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineId, serialNumber: "PO-VIS-1" }, "u1")
      assetId = r.assetId
    })

    // Mirror the getAssets query: LEFT JOIN both origins + COALESCE description.
    const rows = await db
      .select({
        id: schema.orderUnits.id,
        orderLineId: schema.orderUnits.orderLineId,
        description: sql<string>`coalesce(${schema.orderLines.description}, ${schema.purchaseOrderLines.itemDescription})`,
      })
      .from(schema.orderUnits)
      .leftJoin(schema.orderLines, eq(schema.orderUnits.orderLineId, schema.orderLines.id))
      .leftJoin(schema.purchaseOrderLines, eq(schema.orderUnits.purchaseOrderLineId, schema.purchaseOrderLines.id))
      .where(eq(schema.orderUnits.id, assetId))

    expect(rows.length).toBe(1) // was 0 with the old INNER JOIN on orderLineId
    expect(rows[0].orderLineId).toBeNull()
    expect(rows[0].description).toBe("IT laptop")
  })

  test("rejects an unknown purchase order line, no row inserted", async () => {
    const { receivePurchaseOrderLineCore } = await import("./procurement")
    const before = await db.select().from(schema.orderUnits)

    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(
          tx,
          { purchaseOrderLineId: createId(), serialNumber: "PO-SN-006" },
          "u1"
        )
      })
    ).rejects.toThrow("Purchase order line not found")

    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })
})

// ─── Cancel line ─────────────────────────────────────────────────────────────
// cancelPurchaseOrderLineCore soft-cancels a line (only while qtyReceived = 0)
// and recomputes the PO status EXCLUDING cancelled lines.
async function seedPoWithLines(qtysOrdered: number[]) {
  const supplierId = createId()
  const poId = createId()
  const procurementCaseId = createId()
  await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_SUPPLIER" })
  await db.insert(schema.procurementCases).values({ id: procurementCaseId, source: "system_manual" })
  await db.insert(schema.purchaseOrders).values({
    id: poId,
    supplierId,
    poNumber: "PO-" + poId.slice(-8),
    status: "ordered",
    procurementCaseId,
  })
  const lineIds: string[] = []
  for (const qty of qtysOrdered) {
    const lineId = createId()
    lineIds.push(lineId)
    await db.insert(schema.purchaseOrderLines).values({
      id: lineId,
      purchaseOrderId: poId,
      itemDescription: "IT laptop",
      qtyOrdered: qty,
    })
  }
  return { poId, lineIds }
}

describe("one purchase order per procurement case (unique index)", () => {
  test("a second PO for the same procurement case is rejected by the DB", async () => {
    const supplierId = createId()
    const procurementCaseId = createId()
    await db.insert(schema.suppliers).values({ id: supplierId, name: "IT_SUPPLIER_UQ" })
    await db.insert(schema.procurementCases).values({ id: procurementCaseId, source: "system_manual" })
    await db.insert(schema.purchaseOrders).values({
      id: createId(),
      supplierId,
      poNumber: "PO-UQ-1",
      status: "ordered",
      procurementCaseId,
    })

    await expect(
      db.insert(schema.purchaseOrders).values({
        id: createId(),
        supplierId,
        poNumber: "PO-UQ-2",
        status: "ordered",
        procurementCaseId,
      })
    ).rejects.toThrow()
  })
})

describe("cancelPurchaseOrderLineCore", () => {
  test("cancels an un-received line, records reason, emits event", async () => {
    const { cancelPurchaseOrderLineCore } = await import("./procurement")
    const { lineIds } = await seedPoWithLines([1, 1])

    await db.transaction(async (tx) => {
      await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0], reason: "not stocked" }, "u1")
    })

    const [line] = await db
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.id, lineIds[0]))
    expect(line.status).toBe("cancelled")
    expect(line.cancelReason).toBe("not stocked")
    expect(line.cancelledAt).not.toBeNull()

    const events = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.aggregateId, line.purchaseOrderId))
    expect(events.some((e) => e.eventType === "PurchaseOrderLineCancelled")).toBe(true)
  })

  test("PO with a remaining fully-received line becomes received after cancelling the other", async () => {
    const { receivePurchaseOrderLineCore, cancelPurchaseOrderLineCore } = await import("./procurement")
    const { poId, lineIds } = await seedPoWithLines([1, 1])

    // Receive line 0 fully; line 1 stays un-received then gets cancelled.
    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0], serialNumber: "PO-C-1" }, "u1")
    })
    let [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("partially_received") // line 1 still open

    await db.transaction(async (tx) => {
      await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[1] }, "u1")
    })
    ;[po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("received") // cancelled line no longer counts
  })

  test("cancelling the only line collapses the PO to cancelled", async () => {
    const { cancelPurchaseOrderLineCore } = await import("./procurement")
    const { poId, lineIds } = await seedPoWithLines([2])

    await db.transaction(async (tx) => {
      await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0] }, "u1")
    })

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("cancelled")
  })

  test("rejects cancelling a line that has received units", async () => {
    const { receivePurchaseOrderLineCore, cancelPurchaseOrderLineCore } = await import("./procurement")
    const { lineIds } = await seedPoWithLines([2])

    await db.transaction(async (tx) => {
      await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0], serialNumber: "PO-C-2" }, "u1")
    })

    await expect(
      db.transaction(async (tx) => {
        await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0] }, "u1")
      })
    ).rejects.toThrow("Cannot cancel a line that has received units")
  })

  test("rejects cancelling an already-cancelled line", async () => {
    const { cancelPurchaseOrderLineCore } = await import("./procurement")
    const { lineIds } = await seedPoWithLines([1, 1])

    await db.transaction(async (tx) => {
      await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0] }, "u1")
    })
    await expect(
      db.transaction(async (tx) => {
        await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0] }, "u1")
      })
    ).rejects.toThrow("Line is already cancelled")
  })
})

describe("receive guards a cancelled line", () => {
  test("rejects receiving a cancelled line, no asset minted", async () => {
    const { cancelPurchaseOrderLineCore, receivePurchaseOrderLineCore } = await import("./procurement")
    const { lineIds } = await seedPoWithLines([1, 1])
    await db.transaction(async (tx) => {
      await cancelPurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0] }, "u1")
    })
    const before = await db.select().from(schema.orderUnits)
    await expect(
      db.transaction(async (tx) => {
        await receivePurchaseOrderLineCore(tx, { purchaseOrderLineId: lineIds[0], serialNumber: "PO-CX-1" }, "u1")
      })
    ).rejects.toThrow("Cannot receive a cancelled line")
    const after = await db.select().from(schema.orderUnits)
    expect(after.length).toBe(before.length)
  })
})
