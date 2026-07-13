// Pure derivation of a procurement case's end-to-end fulfilment stage and
// quantity rollup. Nothing here is stored: the case row keeps its minimal
// stored machine (open/po_linked/closed/...) and this view derives the
// operational stage from the PO, its lines, and pickup tasks — same pattern
// as deriveOrderStatus / deriveRequestStatus.

export type ProcurementFulfilmentStage =
  | "awarded" // case exists, no local PO yet
  | "po_issued"
  | "paid"
  | "ready_for_pickup"
  | "pickup_in_progress" // at least one open pickup task, nothing collected yet
  | "in_transit" // something collected, nothing received yet
  | "partially_received"
  | "received" // every active line fully received
  | "closed"
  | "cancelled"

export interface FulfilmentLineInput {
  status: "active" | "cancelled"
  qtyOrdered: number
  qtyPickedUp: number
  qtyReceived: number
}

export interface FulfilmentPoInput {
  status: string
  paidAt: number | null
  readyForPickupAt: number | null
}

export interface FulfilmentTaskInput {
  status: string
}

export interface FulfilmentRollup {
  ordered: number
  pickedUp: number
  received: number
  /** Collected from the supplier but not yet confirmed at the warehouse. */
  inTransit: number
  remaining: number
}

export const OPEN_PICKUP_TASK_STATUSES = ["pending", "accepted", "arrived", "picked_up"] as const

export function rollupLines(lines: FulfilmentLineInput[]): FulfilmentRollup {
  const active = lines.filter((l) => l.status === "active")
  const ordered = active.reduce((s, l) => s + l.qtyOrdered, 0)
  const pickedUp = active.reduce((s, l) => s + l.qtyPickedUp, 0)
  const received = active.reduce((s, l) => s + l.qtyReceived, 0)
  return {
    ordered,
    pickedUp,
    received,
    inTransit: pickedUp - received,
    remaining: ordered - received,
  }
}

export function deriveProcurementFulfilment(input: {
  caseStatus: string
  po: FulfilmentPoInput | null
  lines: FulfilmentLineInput[]
  pickupTasks: FulfilmentTaskInput[]
}): { stage: ProcurementFulfilmentStage; rollup: FulfilmentRollup } {
  const rollup = rollupLines(input.lines)
  const { caseStatus, po, pickupTasks } = input

  if (caseStatus === "cancelled") return { stage: "cancelled", rollup }
  if (caseStatus === "closed") return { stage: "closed", rollup }
  if (!po || po.status === "cancelled" || rollup.ordered === 0) {
    return { stage: po?.status === "cancelled" ? "cancelled" : "awarded", rollup }
  }

  if (rollup.received >= rollup.ordered) return { stage: "received", rollup }
  if (rollup.received > 0) return { stage: "partially_received", rollup }
  if (rollup.pickedUp > 0) return { stage: "in_transit", rollup }

  const hasOpenTask = pickupTasks.some((t) =>
    (OPEN_PICKUP_TASK_STATUSES as readonly string[]).includes(t.status)
  )
  if (hasOpenTask) return { stage: "pickup_in_progress", rollup }
  if (po.readyForPickupAt) return { stage: "ready_for_pickup", rollup }
  if (po.paidAt) return { stage: "paid", rollup }
  return { stage: "po_issued", rollup }
}

/** A case may close only when every active line is fully received and no pickup task is open. */
export function canCloseProcurementCase(input: {
  caseStatus: string
  po: FulfilmentPoInput | null
  lines: FulfilmentLineInput[]
  pickupTasks: FulfilmentTaskInput[]
}): boolean {
  if (input.caseStatus === "closed" || input.caseStatus === "cancelled" || input.caseStatus === "superseded") {
    return false
  }
  const hasOpenTask = input.pickupTasks.some((t) =>
    (OPEN_PICKUP_TASK_STATUSES as readonly string[]).includes(t.status)
  )
  if (hasOpenTask) return false
  const { stage } = deriveProcurementFulfilment(input)
  return stage === "received"
}

/** Per-line quantity still plannable for new pickup tasks. */
export function plannableQty(line: FulfilmentLineInput, plannedOpen: number): number {
  if (line.status !== "active") return 0
  return Math.max(0, line.qtyOrdered - line.qtyPickedUp - plannedOpen)
}
