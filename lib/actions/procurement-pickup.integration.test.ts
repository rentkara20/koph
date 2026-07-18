// Integration coverage for Supplier Pickup as a first-class procurement
// capability: pickup tasks are created only from a PO, partials are guarded,
// the partner can never complete the procurement, warehouse receipt attributes
// quantities and auto-closes the task, and QC-required POs mint receiving_qc.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "@/lib/db/test-migrate"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"

let dir: string
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pickup-test-"))
  const client = createClient({ url: `file:${join(dir, "test.db")}` })
  db = drizzle(client, { schema })
  await migrate(client, { migrationsFolder: "./lib/db/migrations" })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seedPo(opts: { qtyOrdered?: number; ready?: boolean; qcRequired?: boolean; lines?: number[] } = {}) {
  const supplierId = createId()
  const poId = createId()
  const procurementCaseId = createId()
  await db.insert(schema.suppliers).values({
    id: supplierId,
    name: "PICKUP_SUPPLIER",
    address: "Olaya St, Riyadh",
    pickupContactName: "Abu Fahad",
    pickupContactMobile: "0555555555",
  })
  await db.insert(schema.procurementCases).values({ id: procurementCaseId, source: "system_manual" })
  await db.insert(schema.purchaseOrders).values({
    id: poId,
    supplierId,
    poNumber: "PO-" + poId.slice(-8),
    status: "ordered",
    procurementCaseId,
    readyForPickupAt: opts.ready === false ? null : Date.now(),
    qcRequired: opts.qcRequired ?? false,
  })
  const lineQtys = opts.lines ?? [opts.qtyOrdered ?? 20]
  const lineIds: string[] = []
  for (const qty of lineQtys) {
    const lineId = createId()
    lineIds.push(lineId)
    await db.insert(schema.purchaseOrderLines).values({
      id: lineId,
      purchaseOrderId: poId,
      itemDescription: `Monitor x${qty}`,
      qtyOrdered: qty,
    })
  }
  return { poId, procurementCaseId, supplierId, lineIds }
}

async function seedPartner() {
  const partnerId = createId()
  await db.insert(schema.partners).values({ id: partnerId, name: "Pickup Partner", status: "active" })
  return partnerId
}

async function createPickup(poId: string, partnerId: string, lines: { purchaseOrderLineId: string; qtyPlanned: number }[]) {
  const { createPickupTaskCore } = await import("./procurement-pickup")
  let taskId = ""
  await db.transaction(async (tx) => {
    const r = await createPickupTaskCore(tx, { purchaseOrderId: poId, partnerId, lines }, null)
    taskId = r.taskId
  })
  return taskId
}

async function setTaskStatus(taskId: string, status: string) {
  await db
    .update(schema.partnerTasks)
    .set({ status: status as "accepted" })
    .where(eq(schema.partnerTasks.id, taskId))
}

async function collect(taskId: string, entries: { pickupTaskLineId: string; qtyPickedUp: number }[]) {
  const { collectPickupCore } = await import("./procurement-pickup")
  await db.transaction(async (tx) => {
    await collectPickupCore(tx, taskId, "arrived", entries)
  })
}

async function taskLinesOf(taskId: string) {
  return db.select().from(schema.pickupTaskLines).where(eq(schema.pickupTaskLines.pickupTaskId, taskId))
}

async function receive(lineId: string, pickupTaskId?: string, serial?: string) {
  const { receivePurchaseOrderLineCore } = await import("./procurement")
  let assetId = ""
  await db.transaction(async (tx) => {
    const r = await receivePurchaseOrderLineCore(
      tx,
      { purchaseOrderLineId: lineId, serialNumber: serial ?? "SN-" + createId().slice(-10), pickupTaskId },
      null
    )
    assetId = r.assetId
  })
  return assetId
}

describe("createPickupTaskCore", () => {
  test("creates a pickup task inheriting case/PO/supplier and plans lines", async () => {
    const { poId, procurementCaseId, lineIds } = await seedPo({ qtyOrdered: 20 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [
      { purchaseOrderLineId: lineIds[0], qtyPlanned: 8 },
    ])

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.kind).toBe("supplier_pickup")
    expect(task.requestId).toBeNull()
    expect(task.purchaseOrderId).toBe(poId)
    expect(task.procurementCaseId).toBe(procurementCaseId)
    expect(task.destinationLocation).toBe("main_warehouse")
    expect(task.status).toBe("pending")
    expect(task.taskToken).toBeTruthy()

    const lines = await taskLinesOf(taskId)
    expect(lines).toHaveLength(1)
    expect(lines[0].qtyPlanned).toBe(8)
  })

  test("blocked when PO is not marked ready for pickup", async () => {
    const { poId, lineIds } = await seedPo({ ready: false })
    const partnerId = await seedPartner()
    await expect(
      createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 1 }])
    ).rejects.toThrow(/ready for pickup/)
  })

  test("over-planning beyond remaining is blocked, including across open tasks", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 20 })
    const partnerId = await seedPartner()
    await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 15 }])
    await expect(
      createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 6 }])
    ).rejects.toThrow(/remain plannable/)
    // 5 remaining is fine
    await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 5 }])
  })

  test("line from another PO is rejected", async () => {
    const { poId } = await seedPo({})
    const other = await seedPo({})
    const partnerId = await seedPartner()
    await expect(
      createPickup(poId, partnerId, [{ purchaseOrderLineId: other.lineIds[0], qtyPlanned: 1 }])
    ).rejects.toThrow(/does not belong/)
  })
})

describe("collectPickupCore (partner picked up)", () => {
  test("records partial collection and pushes counters to PO line", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 20 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 8 }])
    await setTaskStatus(taskId, "arrived")

    const [tl] = await taskLinesOf(taskId)
    await collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 8 }])

    const [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.status).toBe("picked_up")
    expect(task.pickedUpAt).toBeTruthy()
    const [poLine] = await db
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.id, lineIds[0]))
    expect(poLine.qtyPickedUp).toBe(8)
    expect(poLine.qtyReceived).toBe(0) // pickup NEVER receives
  })

  test("cannot collect more than planned", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 20 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 5 }])
    await setTaskStatus(taskId, "arrived")
    const [tl] = await taskLinesOf(taskId)
    await expect(collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 6 }])).rejects.toThrow(
      /more than planned/
    )
  })

  test("double-submit races the status CAS — second write loses", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 20 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 4 }])
    await setTaskStatus(taskId, "arrived")
    const [tl] = await taskLinesOf(taskId)
    await collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 4 }])
    await expect(collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 4 }])).rejects.toThrow(
      /TASK_STATUS_CHANGED/
    )
    const [poLine] = await db
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.id, lineIds[0]))
    expect(poLine.qtyPickedUp).toBe(4) // not doubled
  })
})

describe("warehouse receipt closes the loop", () => {
  test("receive attributed to the pickup task; auto-closes when all received; PO completes only then", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 3 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 3 }])
    await setTaskStatus(taskId, "arrived")
    const [tl] = await taskLinesOf(taskId)
    await collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 3 }])

    await receive(lineIds[0], taskId)
    await receive(lineIds[0], taskId)

    let [task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.status).toBe("picked_up") // 2 of 3 — still open

    await receive(lineIds[0], taskId)
    ;[task] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskId))
    expect(task.status).toBe("closed")

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("received")
    const lines = await taskLinesOf(taskId)
    expect(lines[0].qtyReceived).toBe(3)
  })

  test("cannot receive against a task more than it collected", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 10 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 2 }])
    await setTaskStatus(taskId, "arrived")
    const [tl] = await taskLinesOf(taskId)
    await collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 2 }])

    await receive(lineIds[0], taskId)
    await receive(lineIds[0], taskId)
    // Task auto-closed after collecting-count reached; a further receipt is
    // refused (task no longer picked_up), so over-receipt is impossible.
    await expect(receive(lineIds[0], taskId)).rejects.toThrow(
      /more than this pickup task collected|not collected the goods/
    )
  })

  test("receive without a pickup task still works (direct supplier delivery)", async () => {
    const { lineIds } = await seedPo({ qtyOrdered: 1 })
    const assetId = await receive(lineIds[0])
    const [asset] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    expect(asset.status).toBe("in_stock")
  })

  test("receiving against a task that has not picked up is blocked", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 5 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 5 }])
    await expect(receive(lineIds[0], taskId)).rejects.toThrow(/not collected the goods/)
  })

  test("two-partner partial pickup: 8 today + 12 tomorrow, quantities always visible", async () => {
    const { poId, lineIds } = await seedPo({ qtyOrdered: 20 })
    const partnerA = await seedPartner()
    const partnerB = await seedPartner()

    // Partner A collects 8
    const taskA = await createPickup(poId, partnerA, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 8 }])
    await setTaskStatus(taskA, "arrived")
    const [tlA] = await taskLinesOf(taskA)
    await collect(taskA, [{ pickupTaskLineId: tlA.id, qtyPickedUp: 8 }])

    // Rollup after A's pickup: 20 ordered / 8 picked / 0 received / 20 remaining
    const { deriveProcurementFulfilment } = await import("@/lib/domain/procurement-fulfilment")
    const linesNow = await db
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.purchaseOrderId, poId))
    const view = deriveProcurementFulfilment({
      caseStatus: "open",
      po: { status: "ordered", paidAt: null, readyForPickupAt: Date.now() },
      lines: linesNow.map((l) => ({ status: l.status, qtyOrdered: l.qtyOrdered, qtyPickedUp: l.qtyPickedUp, qtyReceived: l.qtyReceived })),
      pickupTasks: [{ status: "picked_up" }],
    })
    expect(view.rollup).toEqual({ ordered: 20, pickedUp: 8, received: 0, inTransit: 8, remaining: 20 })
    expect(view.stage).toBe("in_transit")

    // Warehouse receives A's 8
    for (let i = 0; i < 8; i++) await receive(lineIds[0], taskA)
    const [closedA] = await db.select().from(schema.partnerTasks).where(eq(schema.partnerTasks.id, taskA))
    expect(closedA.status).toBe("closed")

    // Partner B collects the remaining 12 (planning 13 must fail)
    await expect(
      createPickup(poId, partnerB, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 13 }])
    ).rejects.toThrow(/remain plannable/)
    const taskB = await createPickup(poId, partnerB, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 12 }])
    await setTaskStatus(taskB, "arrived")
    const [tlB] = await taskLinesOf(taskB)
    await collect(taskB, [{ pickupTaskLineId: tlB.id, qtyPickedUp: 12 }])
    for (let i = 0; i < 12; i++) await receive(lineIds[0], taskB)

    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId))
    expect(po.status).toBe("received")
    const [finalLine] = await db
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.id, lineIds[0]))
    expect(finalLine.qtyPickedUp).toBe(20)
    expect(finalLine.qtyReceived).toBe(20)

    // Nothing over-receivable
    await expect(receive(lineIds[0])).rejects.toThrow(/more than ordered/)
  })
})

describe("QC gate", () => {
  test("qcRequired PO mints assets at receiving_qc, not in_stock", async () => {
    const { lineIds } = await seedPo({ qtyOrdered: 1, qcRequired: true })
    const assetId = await receive(lineIds[0])
    const [asset] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, assetId))
    expect(asset.status).toBe("receiving_qc")
  })

  test("qc_pass → in_stock, qc_fail → damaged, via applyAssetTransition", async () => {
    const { lineIds } = await seedPo({ lines: [2], qcRequired: true })
    const a1 = await receive(lineIds[0])
    const a2 = await receive(lineIds[0])
    const { applyAssetTransition } = await import("./asset-transition")
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, a1, "qc_pass", {})
    })
    await db.transaction(async (tx) => {
      await applyAssetTransition(tx, a2, "qc_fail", { notes: "cracked panel" })
    })
    const [u1] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, a1))
    const [u2] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, a2))
    expect(u1.status).toBe("in_stock")
    expect(u2.status).toBe("damaged")
  })

  test("bulk QC passes every waiting device atomically", async () => {
    const { lineIds } = await seedPo({ lines: [2], qcRequired: true })
    const a1 = await receive(lineIds[0])
    const a2 = await receive(lineIds[0])
    const { qcAssetsCore } = await import("./procurement")

    await db.transaction(async (tx) => {
      await qcAssetsCore(tx, [a1, a2], true, null, "warehouse-user")
    })

    const [u1] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, a1))
    const [u2] = await db.select().from(schema.orderUnits).where(eq(schema.orderUnits.id, a2))
    expect([u1.status, u2.status]).toEqual(["in_stock", "in_stock"])
  })

  test("rejecting a device requires a recorded reason", async () => {
    const { lineIds } = await seedPo({ qtyOrdered: 1, qcRequired: true })
    const assetId = await receive(lineIds[0])
    const { qcAssetsCore } = await import("./procurement")

    await expect(
      db.transaction((tx) => qcAssetsCore(tx, [assetId], false, "", "warehouse-user"))
    ).rejects.toThrow(/reason is required/i)
  })
})

describe("partner can never complete a pickup", () => {
  test("canTransition forbids every partner exit from picked_up", async () => {
    const { canTransition } = await import("@/lib/domain/task-status")
    for (const action of ["accept", "reject", "start", "mark_done", "mark_failed", "mark_arrived", "mark_picked_up"] as const) {
      expect(canTransition("picked_up", action, "supplier_pickup")).toBe(false)
    }
  })

  test("XOR origin: a task with both requestId and purchaseOrderId is rejected by the DB", async () => {
    const { poId } = await seedPo({})
    const partnerId = await seedPartner()
    await expect(
      db.insert(schema.partnerTasks).values({
        id: createId(),
        requestId: createId(), // both set → CHECK violation
        purchaseOrderId: poId,
        kind: "supplier_pickup",
        partnerId,
        taskToken: generateToken(),
        taskTokenExpiresAt: Date.now() + 1000,
        status: "pending",
      })
    ).rejects.toThrow() // CHECK partner_task_single_origin_chk violation
  })
})

describe("procurement case close", () => {
  test("canCloseProcurementCase only after full receipt and no open tasks", async () => {
    const { canCloseProcurementCase } = await import("@/lib/domain/procurement-fulfilment")
    const { poId, lineIds } = await seedPo({ qtyOrdered: 2 })
    const partnerId = await seedPartner()
    const taskId = await createPickup(poId, partnerId, [{ purchaseOrderLineId: lineIds[0], qtyPlanned: 2 }])
    await setTaskStatus(taskId, "arrived")
    const [tl] = await taskLinesOf(taskId)
    await collect(taskId, [{ pickupTaskLineId: tl.id, qtyPickedUp: 2 }])
    await receive(lineIds[0], taskId)

    const read = async () => {
      const lines = await db
        .select()
        .from(schema.purchaseOrderLines)
        .where(eq(schema.purchaseOrderLines.purchaseOrderId, poId))
      const tasks = await db
        .select({ status: schema.partnerTasks.status })
        .from(schema.partnerTasks)
        .where(eq(schema.partnerTasks.purchaseOrderId, poId))
      return {
        caseStatus: "open",
        po: { status: "ordered", paidAt: null, readyForPickupAt: Date.now() },
        lines: lines.map((l) => ({ status: l.status, qtyOrdered: l.qtyOrdered, qtyPickedUp: l.qtyPickedUp, qtyReceived: l.qtyReceived })),
        pickupTasks: tasks,
      }
    }
    expect(canCloseProcurementCase(await read())).toBe(false) // 1 of 2 received
    await receive(lineIds[0], taskId)
    expect(canCloseProcurementCase(await read())).toBe(true)
  })
})
