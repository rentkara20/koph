import { describe, it, expect } from "vitest"
import {
  deriveProcurementFulfilment,
  canCloseProcurementCase,
  rollupLines,
  plannableQty,
  type FulfilmentLineInput,
} from "./procurement-fulfilment"

const line = (over: Partial<FulfilmentLineInput> = {}): FulfilmentLineInput => ({
  status: "active",
  qtyOrdered: 20,
  qtyPickedUp: 0,
  qtyReceived: 0,
  ...over,
})

const po = (over: Partial<{ status: string; paidAt: number | null; readyForPickupAt: number | null }> = {}) => ({
  status: "ordered",
  paidAt: null,
  readyForPickupAt: null,
  ...over,
})

describe("rollupLines", () => {
  it("aggregates active lines and derives inTransit/remaining", () => {
    const r = rollupLines([
      line({ qtyOrdered: 20, qtyPickedUp: 8, qtyReceived: 3 }),
      line({ qtyOrdered: 5, qtyPickedUp: 5, qtyReceived: 5 }),
    ])
    expect(r).toEqual({ ordered: 25, pickedUp: 13, received: 8, inTransit: 5, remaining: 17 })
  })
  it("excludes cancelled lines", () => {
    const r = rollupLines([line(), line({ status: "cancelled", qtyOrdered: 99 })])
    expect(r.ordered).toBe(20)
  })
})

describe("deriveProcurementFulfilment", () => {
  const base = { caseStatus: "po_linked", pickupTasks: [] as { status: string }[] }

  it("awarded when no PO", () => {
    expect(deriveProcurementFulfilment({ ...base, po: null, lines: [] }).stage).toBe("awarded")
  })
  it("po_issued → paid → ready_for_pickup by milestones", () => {
    const lines = [line()]
    expect(deriveProcurementFulfilment({ ...base, po: po(), lines }).stage).toBe("po_issued")
    expect(deriveProcurementFulfilment({ ...base, po: po({ paidAt: 1 }), lines }).stage).toBe("paid")
    expect(
      deriveProcurementFulfilment({ ...base, po: po({ paidAt: 1, readyForPickupAt: 2 }), lines }).stage
    ).toBe("ready_for_pickup")
  })
  it("pickup_in_progress with an open task, nothing collected", () => {
    expect(
      deriveProcurementFulfilment({
        ...base,
        po: po({ readyForPickupAt: 1 }),
        lines: [line()],
        pickupTasks: [{ status: "accepted" }],
      }).stage
    ).toBe("pickup_in_progress")
  })
  it("in_transit once something is collected", () => {
    expect(
      deriveProcurementFulfilment({
        ...base,
        po: po({ readyForPickupAt: 1 }),
        lines: [line({ qtyPickedUp: 8 })],
        pickupTasks: [{ status: "picked_up" }],
      }).stage
    ).toBe("in_transit")
  })
  it("partially_received → received as receipts land", () => {
    const mk = (received: number) =>
      deriveProcurementFulfilment({
        ...base,
        po: po({ readyForPickupAt: 1 }),
        lines: [line({ qtyPickedUp: 20, qtyReceived: received })],
        pickupTasks: [],
      }).stage
    expect(mk(8)).toBe("partially_received")
    expect(mk(20)).toBe("received")
  })
  it("failed/closed tasks do not count as open", () => {
    expect(
      deriveProcurementFulfilment({
        ...base,
        po: po({ readyForPickupAt: 1 }),
        lines: [line()],
        pickupTasks: [{ status: "failed" }, { status: "closed" }, { status: "cancelled" }],
      }).stage
    ).toBe("ready_for_pickup")
  })
  it("cancelled lines don't block received", () => {
    expect(
      deriveProcurementFulfilment({
        ...base,
        po: po(),
        lines: [line({ qtyPickedUp: 20, qtyReceived: 20 }), line({ status: "cancelled" })],
        pickupTasks: [],
      }).stage
    ).toBe("received")
  })
  it("case closed/cancelled wins", () => {
    expect(deriveProcurementFulfilment({ caseStatus: "closed", po: po(), lines: [line()], pickupTasks: [] }).stage).toBe("closed")
    expect(deriveProcurementFulfilment({ caseStatus: "cancelled", po: null, lines: [], pickupTasks: [] }).stage).toBe("cancelled")
  })
})

describe("canCloseProcurementCase", () => {
  it("only at received, never from terminal statuses", () => {
    const received = {
      caseStatus: "po_linked",
      po: po(),
      lines: [line({ qtyPickedUp: 20, qtyReceived: 20 })],
      pickupTasks: [],
    }
    expect(canCloseProcurementCase(received)).toBe(true)
    expect(canCloseProcurementCase({ ...received, lines: [line({ qtyReceived: 19, qtyPickedUp: 20 })] })).toBe(false)
    expect(canCloseProcurementCase({ ...received, caseStatus: "closed" })).toBe(false)
    expect(canCloseProcurementCase({ ...received, caseStatus: "superseded" })).toBe(false)
  })
  it("blocked while a pickup task is still open", () => {
    expect(
      canCloseProcurementCase({
        caseStatus: "po_linked",
        po: po(),
        lines: [line({ qtyPickedUp: 20, qtyReceived: 20 })],
        pickupTasks: [{ status: "picked_up" }],
      })
    ).toBe(false)
  })
})

describe("plannableQty", () => {
  it("ordered − pickedUp − open planned, floored at 0", () => {
    expect(plannableQty(line({ qtyOrdered: 20, qtyPickedUp: 8 }), 4)).toBe(8)
    expect(plannableQty(line({ qtyOrdered: 20, qtyPickedUp: 8 }), 20)).toBe(0)
    expect(plannableQty(line({ status: "cancelled" }), 0)).toBe(0)
  })
})
