import { describe, it, expect } from "vitest"
import {
  deriveNextActions,
  primaryActionsPerTrack,
  type WorkspaceFacts,
} from "./next-action"

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_760_000_000_000

const EMPTY: WorkspaceFacts = {
  order: { id: "ord1", orderNumber: "10669", status: "confirmed", rentalEndAt: null },
  demand: { requestedQty: 0, sourcedQty: 0, stockAssignedQty: 0 },
  sourcing: [],
  erpReferences: [],
  purchaseOrders: [],
  units: { total: 0, qcPending: 0, inStock: 0, delivered: 0, returned: 0, retired: 0 },
  jobs: [],
  payments: { unbatched: [], draftBatches: [] },
  now: NOW,
}

const keysOf = (facts: WorkspaceFacts) => deriveNextActions(facts).map((a) => a.key)

describe("deriveNextActions", () => {
  it("rule 1: uncovered demand on a confirmed order → sourceItems", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      demand: { requestedQty: 5, sourcedQty: 2, stockAssignedQty: 1 },
    })
    const source = actions.find((a) => a.key === "sourceItems")
    expect(source).toBeDefined()
    expect(source!.ownerRole).toBe("procurement")
    expect(source!.href).toBe("/admin/sourcing/new?orderId=ord1")
    expect(source!.urgency).toBe("now")
    expect(source!.entityRef).toEqual({ type: "order", id: "ord1" })
  })

  it("rule 1 does not fire when demand is covered or order is draft", () => {
    expect(
      keysOf({ ...EMPTY, demand: { requestedQty: 3, sourcedQty: 2, stockAssignedQty: 1 } })
    ).not.toContain("sourceItems")
    expect(
      keysOf({
        ...EMPTY,
        order: { ...EMPTY.order, status: "draft" },
        demand: { requestedQty: 3, sourcedQty: 0, stockAssignedQty: 0 },
      })
    ).not.toContain("sourceItems")
  })

  it("rule 7: open ERP reference without an ERP PO ref → blocked addErpPoReference", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      erpReferences: [{ id: "case1", status: "open", hasErpRef: false, hasPurchaseOrder: false }],
    })
    const erp = actions.find((a) => a.key === "addErpPoReference")
    expect(erp).toBeDefined()
    expect(erp!.blockedBy).toBe("waitingErpPo")
    expect(erp!.ownerRole).toBe("procurement")
    expect(erp!.href).toBe("/admin/orders/ord1?tab=buying")
    expect(erp!.entityRef).toEqual({ type: "procurement_case", id: "case1" })
  })

  it("rule 12: in-stock units and no open delivery job → createDeliveryJob", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      units: { ...EMPTY.units, total: 3, inStock: 3 },
    })
    const job = actions.find((a) => a.key === "createDeliveryJob")
    expect(job).toBeDefined()
    expect(job!.ownerRole).toBe("ops")
    expect(job!.href).toBe("/admin/requests/new?orderNumber=10669")
  })

  it("rule 12 suppressed while an open delivery job exists", () => {
    const keys = keysOf({
      ...EMPTY,
      units: { ...EMPTY.units, total: 3, inStock: 3 },
      jobs: [
        {
          id: "job1",
          kind: "delivery",
          status: "assigned",
          hasTask: true,
          taskStatuses: ["accepted"],
          needsAuthorizedSignature: false,
        },
      ],
    })
    expect(keys).not.toContain("createDeliveryJob")
  })

  it("rule 15: receiver signed but unauthorized, no stage-2 → requestAuthorizedSignature", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      jobs: [
        {
          id: "job1",
          kind: "delivery",
          status: "in_progress",
          hasTask: true,
          taskStatuses: ["pending_signoff"],
          needsAuthorizedSignature: true,
        },
      ],
    })
    const sig = actions.find((a) => a.key === "requestAuthorizedSignature")
    expect(sig).toBeDefined()
    expect(sig!.ownerRole).toBe("ops")
    expect(sig!.href).toBe("/admin/requests/job1")
    // rule 14 fires in parallel on the same job
    expect(actions.map((a) => a.key)).toContain("reviewSignoff")
  })

  it("rule 17: rental ending within 30 days with delivered units → scheduleCollection", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      order: { ...EMPTY.order, rentalEndAt: NOW + 10 * DAY },
      units: { ...EMPTY.units, total: 2, delivered: 2 },
    })
    const collect = actions.find((a) => a.key === "scheduleCollection")
    expect(collect).toBeDefined()
    expect(collect!.urgency).toBe("scheduled")
    expect(collect!.href).toBe("/admin/requests/new?orderNumber=10669&type=collection")
  })

  it("rule 17 does not fire when a collection job already exists or end is far", () => {
    expect(
      keysOf({
        ...EMPTY,
        order: { ...EMPTY.order, rentalEndAt: NOW + 10 * DAY },
        units: { ...EMPTY.units, total: 2, delivered: 2 },
        jobs: [
          {
            id: "job2",
            kind: "collection",
            status: "draft",
            hasTask: false,
            taskStatuses: [],
            needsAuthorizedSignature: false,
          },
        ],
      })
    ).not.toContain("scheduleCollection")
    expect(
      keysOf({
        ...EMPTY,
        order: { ...EMPTY.order, rentalEndAt: NOW + 90 * DAY },
        units: { ...EMPTY.units, total: 2, delivered: 2 },
      })
    ).not.toContain("scheduleCollection")
  })

  it("rule 20: all units back and all jobs closed → closeRequest", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      order: { ...EMPTY.order, status: "partially_fulfilled" },
      units: { total: 3, qcPending: 0, inStock: 0, delivered: 0, returned: 2, retired: 1 },
      jobs: [
        {
          id: "job1",
          kind: "delivery",
          status: "completed",
          hasTask: true,
          taskStatuses: ["closed"],
          needsAuthorizedSignature: false,
        },
        {
          id: "job2",
          kind: "collection",
          status: "completed",
          hasTask: true,
          taskStatuses: ["closed"],
          needsAuthorizedSignature: false,
        },
      ],
    })
    const close = actions.find((a) => a.key === "closeRequest")
    expect(close).toBeDefined()
    expect(close!.ownerRole).toBe("ops")
    expect(close!.href).toBe("/admin/orders/ord1")
  })

  it("closed (fulfilled) request → empty", () => {
    const facts: WorkspaceFacts = {
      ...EMPTY,
      order: { ...EMPTY.order, status: "fulfilled" },
      demand: { requestedQty: 5, sourcedQty: 0, stockAssignedQty: 0 },
      units: { ...EMPTY.units, total: 3, inStock: 3 },
    }
    expect(deriveNextActions(facts)).toEqual([])
    expect(deriveNextActions({ ...facts, order: { ...facts.order, status: "cancelled" } })).toEqual([])
  })

  it("multiple parallel actions across tracks coexist", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      demand: { requestedQty: 10, sourcedQty: 5, stockAssignedQty: 0 },
      purchaseOrders: [
        {
          id: "po1",
          poNumber: "PO-0042",
          status: "partially_received",
          qtyOrdered: 5,
          qtyReceived: 2,
          readyForPickup: false,
          hasOpenPickupTask: false,
          qcPendingCount: 1,
        },
      ],
      units: { total: 2, qcPending: 1, inStock: 1, delivered: 0, returned: 0, retired: 0 },
    })
    const keys = actions.map((a) => a.key)
    expect(keys).toContain("sourceItems")
    expect(keys).toContain("receiveDevices")
    expect(keys).toContain("qcDevices")
    expect(keys).toContain("createDeliveryJob")

    // The header shows one action per owner track, highest urgency first.
    const primary = primaryActionsPerTrack(actions)
    const roles = primary.map((a) => a.ownerRole)
    expect(new Set(roles).size).toBe(roles.length)
    expect(roles).toContain("procurement")
    expect(roles).toContain("warehouse")
    expect(roles).toContain("ops")
  })

  it("rules 2-6 walk the sourcing pipeline", () => {
    const base = {
      id: "src1",
      itemCount: 2,
      rfqs: [] as { id: string; status: string; quotationCount: number }[],
      quotationCount: 0,
      hasActiveAward: false,
      hasApprovedApproval: false,
    }
    expect(keysOf({ ...EMPTY, sourcing: [{ ...base, status: "draft" }] })).toContain("sendRfqs")
    expect(
      keysOf({
        ...EMPTY,
        sourcing: [
          { ...base, status: "rfq_sent", rfqs: [{ id: "rfq1", status: "sent", quotationCount: 0 }] },
        ],
      })
    ).toContain("recordQuotation")
    expect(
      keysOf({ ...EMPTY, sourcing: [{ ...base, status: "quotes_received", quotationCount: 2 }] })
    ).toContain("awardItems")
    expect(
      keysOf({
        ...EMPTY,
        sourcing: [
          { ...base, status: "under_evaluation", quotationCount: 2, hasActiveAward: true },
        ],
      })
    ).toContain("approveSelection")
    expect(
      keysOf({
        ...EMPTY,
        sourcing: [
          { ...base, status: "approved", quotationCount: 2, hasActiveAward: true, hasApprovedApproval: true },
        ],
      })
    ).toContain("handOffToPurchasing")
  })

  it("rules 18-19: batchable payments and draft batches → finance actions", () => {
    const actions = deriveNextActions({
      ...EMPTY,
      payments: {
        unbatched: [
          { taskId: "t1", partnerId: "p1", period: "2026-06", monthClosed: true },
          { taskId: "t2", partnerId: "p1", period: "2026-06", monthClosed: true },
          { taskId: "t3", partnerId: "p1", period: "2026-07", monthClosed: false },
        ],
        draftBatches: [{ id: "batch1" }],
      },
    })
    const batches = actions.filter((a) => a.key === "generatePaymentBatch")
    expect(batches).toHaveLength(1)
    expect(batches[0].href).toBe("/admin/payments?partner=p1&period=2026-06")
    const approve = actions.find((a) => a.key === "approveBatch")
    expect(approve).toBeDefined()
    expect(approve!.href).toBe("/admin/payments/batch1")
  })
})
