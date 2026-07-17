// Next Action engine (spec §2): a pure, data-driven evaluation of "what should
// happen next on this customer request, by whom, and where". Fed the same
// WorkspaceFacts the workspace action aggregates; returns zero or more actions
// that can be active in parallel (one per track). Kept free of DB/i18n so it
// is unit-testable — labels come from i18n keys derived from `key`.

import { procurementCaseHref } from "./procurement-case-navigation"

export type NextActionOwnerRole = "procurement" | "warehouse" | "ops" | "finance" | "admin"
export type NextActionUrgency = "now" | "soon" | "scheduled"

export type NextAction = {
  /** Stable id, doubles as the i18n key under workspace.nextActions. */
  key: string
  ownerRole: NextActionOwnerRole
  /** i18n key explaining an external blocker (e.g. awaiting ERP), if any. */
  blockedBy?: string
  /** Deep link the button navigates to (pre-filled where the form supports it). */
  href: string
  urgency: NextActionUrgency
  entityRef: { type: string; id: string }
}

// ─── Facts ───────────────────────────────────────────────────────────────────

export type SourcingFacts = {
  id: string
  status:
    | "draft"
    | "rfq_sent"
    | "quotes_received"
    | "under_evaluation"
    | "approved"
    | "rejected"
    | "handed_off"
    | "cancelled"
    | "closed"
  itemCount: number
  rfqs: { id: string; status: string; quotationCount: number }[]
  quotationCount: number
  hasActiveAward: boolean
  hasApprovedApproval: boolean
}

export type ErpReferenceFacts = {
  id: string
  status: "open" | "handed_off" | "po_linked" | "closed" | "cancelled" | "superseded"
  hasErpRef: boolean
  hasPurchaseOrder: boolean
}

export type PurchaseOrderFacts = {
  id: string
  poNumber: string
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled"
  qtyOrdered: number
  qtyReceived: number
  readyForPickup: boolean
  hasOpenPickupTask: boolean
  qcPendingCount: number
}

export type JobFacts = {
  id: string
  kind: "delivery" | "collection" | "other"
  status:
    | "draft"
    | "assigned"
    | "in_progress"
    | "completed"
    | "failed"
    | "on_hold"
    | "cancelled"
    | "rescheduled"
  hasTask: boolean
  taskStatuses: string[]
  /** Receiver signed but is not an authorized signatory and no stage-2 signature exists. */
  needsAuthorizedSignature: boolean
}

export type UnbatchedPaymentFacts = {
  taskId: string
  partnerId: string
  /** "YYYY-MM" period the closed task belongs to. */
  period: string
  /** True when the task's month has already ended (batchable). */
  monthClosed: boolean
}

export type WorkspaceFacts = {
  order: {
    id: string
    orderNumber: string
    status: "draft" | "confirmed" | "partially_fulfilled" | "fulfilled" | "cancelled"
    rentalEndAt: number | null
  }
  demand: { requestedQty: number; sourcedQty: number; stockAssignedQty: number }
  sourcing: SourcingFacts[]
  erpReferences: ErpReferenceFacts[]
  purchaseOrders: PurchaseOrderFacts[]
  units: { total: number; qcPending: number; inStock: number; delivered: number; returned: number; retired: number }
  jobs: JobFacts[]
  payments: {
    unbatched: UnbatchedPaymentFacts[]
    draftBatches: { id: string }[]
  }
  now: number
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const OPEN_JOB_STATUSES = new Set(["draft", "assigned", "in_progress", "on_hold", "rescheduled"])
const TERMINAL_JOB_STATUSES = new Set(["completed", "cancelled", "failed"])
const ACTIVE_SOURCING = new Set(["draft", "rfq_sent", "quotes_received", "under_evaluation", "approved"])

// ─── Engine ──────────────────────────────────────────────────────────────────

export function deriveNextActions(facts: WorkspaceFacts): NextAction[] {
  // Closed or cancelled request: nothing left to do.
  if (facts.order.status === "fulfilled" || facts.order.status === "cancelled") return []

  const actions: NextAction[] = []
  const orderId = facts.order.id
  const orderRef = encodeURIComponent(facts.order.orderNumber)

  // 1 — demand not covered by sourcing or stock.
  if (
    (facts.order.status === "confirmed" || facts.order.status === "partially_fulfilled") &&
    facts.demand.requestedQty > facts.demand.sourcedQty + facts.demand.stockAssignedQty
  ) {
    actions.push({
      key: "sourceItems",
      ownerRole: "procurement",
      href: `/admin/sourcing/new?orderId=${encodeURIComponent(orderId)}`,
      urgency: "now",
      entityRef: { type: "order", id: orderId },
    })
  }

  for (const s of facts.sourcing) {
    if (!ACTIVE_SOURCING.has(s.status)) continue

    // 2 — sourcing draft with items: send RFQs.
    if (s.status === "draft" && s.itemCount > 0) {
      actions.push({
        key: "sendRfqs",
        ownerRole: "procurement",
        href: `/admin/sourcing/${s.id}`,
        urgency: "now",
        entityRef: { type: "sourcing_request", id: s.id },
      })
    }

    // 3 — RFQ sent, no quotation recorded yet.
    for (const rfq of s.rfqs) {
      if (rfq.status === "sent" && rfq.quotationCount === 0) {
        actions.push({
          key: "recordQuotation",
          ownerRole: "procurement",
          href: `/admin/sourcing/${s.id}`,
          urgency: "soon",
          entityRef: { type: "supplier_rfq", id: rfq.id },
        })
      }
    }

    // 4 — quotations exist, no active award.
    if (s.quotationCount > 0 && !s.hasActiveAward) {
      actions.push({
        key: "awardItems",
        ownerRole: "procurement",
        href: `/admin/sourcing/${s.id}`,
        urgency: "now",
        entityRef: { type: "sourcing_request", id: s.id },
      })
    }

    // 5 — award active, approval missing.
    if (s.hasActiveAward && !s.hasApprovedApproval) {
      actions.push({
        key: "approveSelection",
        ownerRole: "finance",
        href: `/admin/sourcing/${s.id}`,
        urgency: "now",
        entityRef: { type: "sourcing_request", id: s.id },
      })
    }

    // 6 — approved, not handed off to purchasing.
    if (s.status === "approved" && s.hasApprovedApproval) {
      actions.push({
        key: "handOffToPurchasing",
        ownerRole: "procurement",
        href: `/admin/sourcing/${s.id}`,
        urgency: "now",
        entityRef: { type: "sourcing_request", id: s.id },
      })
    }
  }

  for (const c of facts.erpReferences) {
    // 7 — ERP reference row open, waiting on Zoho/Odoo PO number.
    if ((c.status === "open" || c.status === "handed_off") && !c.hasErpRef) {
      actions.push({
        key: "addErpPoReference",
        ownerRole: "procurement",
        blockedBy: "waitingErpPo",
        href: procurementCaseHref(c.id),
        urgency: "now",
        entityRef: { type: "procurement_case", id: c.id },
      })
    }

    // 8 — ERP PO linked, KOPH purchase order not created.
    if (c.status === "po_linked" && c.hasErpRef && !c.hasPurchaseOrder) {
      actions.push({
        key: "createPurchaseOrder",
        ownerRole: "procurement",
        href: procurementCaseHref(c.id),
        urgency: "now",
        entityRef: { type: "procurement_case", id: c.id },
      })
    }
  }

  for (const po of facts.purchaseOrders) {
    if (po.status === "cancelled") continue

    // 9 — ready for supplier pickup, no open pickup task (optional path).
    if (po.status === "ordered" && po.readyForPickup && !po.hasOpenPickupTask) {
      actions.push({
        key: "assignSupplierPickup",
        ownerRole: "ops",
        href: `/admin/procurement/${po.id}`,
        urgency: "soon",
        entityRef: { type: "purchase_order", id: po.id },
      })
    }

    // 10 — units still to receive on this PO.
    if (po.qtyReceived < po.qtyOrdered && (po.status === "ordered" || po.status === "partially_received")) {
      actions.push({
        key: "receiveDevices",
        ownerRole: "warehouse",
        href: `/admin/procurement/${po.id}`,
        urgency: "now",
        entityRef: { type: "purchase_order", id: po.id },
      })
    }

    // 11 — received units waiting in QC.
    if (po.qcPendingCount > 0) {
      actions.push({
        key: "qcDevices",
        ownerRole: "warehouse",
        href: `/admin/procurement/${po.id}`,
        urgency: "now",
        entityRef: { type: "purchase_order", id: po.id },
      })
    }
  }

  // 12 — in-stock units with no open delivery job covering them.
  const hasOpenDeliveryJob = facts.jobs.some(
    (j) => j.kind === "delivery" && OPEN_JOB_STATUSES.has(j.status)
  )
  if (facts.units.inStock > 0 && !hasOpenDeliveryJob) {
    actions.push({
      key: "createDeliveryJob",
      ownerRole: "ops",
      href: `/admin/requests/new?orderNumber=${orderRef}`,
      urgency: "now",
      entityRef: { type: "order", id: orderId },
    })
  }

  for (const job of facts.jobs) {
    // 13 — job drafted but no partner task assigned.
    if (job.status === "draft" && !job.hasTask) {
      actions.push({
        key: "assignPartner",
        ownerRole: "ops",
        href: `/admin/requests/${job.id}`,
        urgency: "now",
        entityRef: { type: "request", id: job.id },
      })
    }

    // 14 — partner finished, ops must review proof and sign off.
    if (job.taskStatuses.includes("pending_signoff")) {
      actions.push({
        key: "reviewSignoff",
        ownerRole: "ops",
        href: `/admin/requests/${job.id}`,
        urgency: "now",
        entityRef: { type: "request", id: job.id },
      })
    }

    // 15 — receiver signed but is not authorized; stage-2 signature missing.
    if (job.needsAuthorizedSignature) {
      actions.push({
        key: "requestAuthorizedSignature",
        ownerRole: "ops",
        href: `/admin/requests/${job.id}`,
        urgency: "now",
        entityRef: { type: "request", id: job.id },
      })
    }

    // 16 — a task failed and the job is not resolved.
    if (job.taskStatuses.includes("failed") && !TERMINAL_JOB_STATUSES.has(job.status)) {
      actions.push({
        key: "handleFailedJob",
        ownerRole: "ops",
        href: `/admin/requests/${job.id}`,
        urgency: "now",
        entityRef: { type: "request", id: job.id },
      })
    }
  }

  // 17 — rental ending within 30 days, delivered units, no collection job.
  const hasCollectionJob = facts.jobs.some((j) => j.kind === "collection")
  if (
    facts.order.rentalEndAt != null &&
    facts.order.rentalEndAt - facts.now <= THIRTY_DAYS_MS &&
    facts.units.delivered > 0 &&
    !hasCollectionJob
  ) {
    actions.push({
      key: "scheduleCollection",
      ownerRole: "ops",
      href: `/admin/requests/new?orderNumber=${orderRef}&type=collection`,
      urgency: facts.order.rentalEndAt <= facts.now ? "now" : "scheduled",
      entityRef: { type: "order", id: orderId },
    })
  }

  // 18 — closed tasks with pending payments in a closed month → batch them.
  const batchable = new Map<string, UnbatchedPaymentFacts>()
  for (const p of facts.payments.unbatched) {
    if (!p.monthClosed) continue
    batchable.set(`${p.partnerId}:${p.period}`, p)
  }
  for (const p of batchable.values()) {
    actions.push({
      key: "generatePaymentBatch",
      ownerRole: "finance",
      href: `/admin/payments?partner=${encodeURIComponent(p.partnerId)}&period=${encodeURIComponent(p.period)}`,
      urgency: "soon",
      entityRef: { type: "partner", id: p.partnerId },
    })
  }

  // 19 — draft batch awaiting approval.
  for (const b of facts.payments.draftBatches) {
    actions.push({
      key: "approveBatch",
      ownerRole: "finance",
      href: `/admin/payments/${b.id}`,
      urgency: "soon",
      entityRef: { type: "payment_batch", id: b.id },
    })
  }

  // 20 — everything returned/retired and jobs closed → close the request.
  const allUnitsBack =
    facts.units.total > 0 && facts.units.returned + facts.units.retired >= facts.units.total
  const allJobsClosed =
    facts.jobs.length > 0 && facts.jobs.every((j) => TERMINAL_JOB_STATUSES.has(j.status))
  if (allUnitsBack && allJobsClosed) {
    actions.push({
      key: "closeRequest",
      ownerRole: "ops",
      href: `/admin/orders/${orderId}`,
      urgency: "now",
      entityRef: { type: "order", id: orderId },
    })
  }

  return actions
}

const URGENCY_RANK: Record<NextActionUrgency, number> = { now: 0, soon: 1, scheduled: 2 }

/** Highest-urgency action per owner track — what the sticky header surfaces. */
export function primaryActionsPerTrack(actions: NextAction[]): NextAction[] {
  const byTrack = new Map<NextActionOwnerRole, NextAction>()
  for (const action of actions) {
    const current = byTrack.get(action.ownerRole)
    if (!current || URGENCY_RANK[action.urgency] < URGENCY_RANK[current.urgency]) {
      byTrack.set(action.ownerRole, action)
    }
  }
  return [...byTrack.values()]
}
