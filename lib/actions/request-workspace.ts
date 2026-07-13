"use server"

// Read-only aggregate behind the Request Mission Control workspace
// (/admin/orders/[id]). One action gathers the entire family of a customer
// request — sourcing, purchasing, receiving, devices, field jobs, signatures,
// payments, documents, activity — computes WorkspaceFacts, and returns the
// derived journey + next actions. No writes here, ever.

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  activityLogs,
  attachments,
  commercialApprovals,
  commercialEvaluations,
  customerContacts,
  customers,
  orderLines,
  orderUnits,
  orders,
  partnerPayments,
  partnerTasks,
  partners,
  paymentBatches,
  procurementCases,
  purchaseOrderLines,
  purchaseOrders,
  requestItems,
  requestTypes,
  requests,
  signatureRequests,
  sourcingRequestItems,
  sourcingRequests,
  supplierQuotationLines,
  supplierQuotations,
  supplierRfqs,
  suppliers,
} from "@/lib/db/schema"
import { getStaffSession } from "@/lib/auth/session"
import {
  deriveRequestJourney,
  type RequestJourneyStage,
} from "@/lib/domain/order-journey"
import {
  deriveNextActions,
  primaryActionsPerTrack,
  type NextAction,
  type WorkspaceFacts,
} from "@/lib/domain/next-action"

const TIMELINE_CAP = 100
const OPEN_TASK_STATUSES = ["pending", "accepted", "in_progress", "arrived", "picked_up", "pending_signoff"]

// ─── Result shape ─────────────────────────────────────────────────────────────

export type WorkspaceLine = {
  id: string
  description: string
  brand: string | null
  model: string | null
  quantity: number
  rentalMonths: number | null
  unitPriceMonthly: number | null
  notes: string | null
  unitCount: number
  deliveredCount: number
}

export type WorkspaceSourcing = {
  id: string
  title: string | null
  status: string
  itemCount: number
  rfqCount: number
  quotationCount: number
  hasActiveAward: boolean
  hasApprovedApproval: boolean
  createdAt: number
}

export type WorkspaceErpReference = {
  id: string
  status: string
  supplierName: string | null
  erpSystem: string | null
  externalPoRef: string | null
  updatedAt: number
  poId: string | null
}

export type WorkspacePurchaseOrder = {
  id: string
  poNumber: string
  status: string
  supplierName: string | null
  qtyOrdered: number
  qtyReceived: number
  orderedAt: number | null
}

export type WorkspaceUnit = {
  id: string
  serialNumber: string | null
  assetTag: string | null
  status: string
  location: string
  description: string
  customerDescription: string | null
}

export type WorkspaceJob = {
  id: string
  requestNumber: string
  kind: "delivery" | "collection" | "other"
  typeName: string | null
  typeNameAr: string | null
  status: string
  itemCount: number
  partnerName: string | null
  taskStatus: string | null
  createdAt: number
}

export type WorkspaceSignature = {
  id: string
  requestId: string | null
  documentName: string
  signatoryRole: string
  status: string
  createdAt: number
}

export type WorkspaceAttachment = {
  id: string
  entityType: string
  fileName: string
  fileUrl: string
  fileType: string
  createdAt: number
}

export type WorkspacePayment = {
  id: string
  partnerName: string | null
  totalAmount: number
  status: string
  batchId: string | null
  batchStatus: string | null
  createdAt: number
}

export type WorkspaceTimelineEntry = {
  id: string
  entityType: string
  i18nKey: string
  createdAt: number
}

export type RequestWorkspace = {
  order: typeof orders.$inferSelect
  customer: typeof customers.$inferSelect | null
  contacts: (typeof customerContacts.$inferSelect)[]
  lines: WorkspaceLine[]
  sourcing: WorkspaceSourcing[]
  erpReferences: WorkspaceErpReference[]
  purchaseOrders: WorkspacePurchaseOrder[]
  units: WorkspaceUnit[]
  jobs: WorkspaceJob[]
  signatures: WorkspaceSignature[]
  attachments: WorkspaceAttachment[]
  payments: WorkspacePayment[]
  timeline: WorkspaceTimelineEntry[]
  rentalEndAt: number | null
  journey: RequestJourneyStage[]
  nextActions: NextAction[]
  primaryActions: NextAction[]
}

// Rental end derived from commercial terms (quoteDate + rental months). The
// schema stores no delivery-anchored rental start, so the quote date is the
// closest derivable anchor — flagged in the P1 report.
function deriveRentalEnd(order: typeof orders.$inferSelect): number | null {
  const months = order.rentalPeriodMonths
  if (!months || months <= 0) return null
  const base = order.quoteDate ?? order.createdAt
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

function periodOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export async function getRequestWorkspace(orderId: string): Promise<RequestWorkspace | null> {
  const session = await getStaffSession()
  if (!session) return null

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
  if (!order) return null

  // ── Order family: customer, contacts, lines ────────────────────────────────
  const [[customer], contacts, lines, sourcingRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, order.customerId)),
    db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, order.customerId))
      .orderBy(customerContacts.createdAt),
    db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(orderLines.createdAt),
    db
      .select()
      .from(sourcingRequests)
      .where(eq(sourcingRequests.orderId, orderId))
      .orderBy(desc(sourcingRequests.createdAt)),
  ])

  const sourcingIds = sourcingRows.map((s) => s.id)

  // ── Sourcing sub-tree: items, RFQs, quotations, evaluations, approvals ─────
  const [items, rfqs, cases] = await Promise.all([
    sourcingIds.length
      ? db
          .select({
            id: sourcingRequestItems.id,
            sourcingRequestId: sourcingRequestItems.sourcingRequestId,
            quantity: sourcingRequestItems.quantity,
            status: sourcingRequestItems.status,
          })
          .from(sourcingRequestItems)
          .where(inArray(sourcingRequestItems.sourcingRequestId, sourcingIds))
      : [],
    sourcingIds.length
      ? db
          .select({
            id: supplierRfqs.id,
            sourcingRequestId: supplierRfqs.sourcingRequestId,
            status: supplierRfqs.status,
          })
          .from(supplierRfqs)
          .where(inArray(supplierRfqs.sourcingRequestId, sourcingIds))
      : [],
    sourcingIds.length
      ? db
          .select({
            id: procurementCases.id,
            sourcingRequestId: procurementCases.sourcingRequestId,
            status: procurementCases.status,
            erpSystem: procurementCases.erpSystem,
            externalPoRef: procurementCases.externalPoRef,
            supplierName: suppliers.name,
            updatedAt: procurementCases.updatedAt,
          })
          .from(procurementCases)
          .leftJoin(suppliers, eq(procurementCases.supplierId, suppliers.id))
          .where(inArray(procurementCases.sourcingRequestId, sourcingIds))
      : [],
  ])

  const rfqIds = rfqs.map((r) => r.id)
  const caseIds = cases.map((c) => c.id)

  const [quotations, evaluations, poRows] = await Promise.all([
    rfqIds.length
      ? db
          .select({
            id: supplierQuotations.id,
            rfqId: supplierQuotations.rfqId,
            status: supplierQuotations.status,
          })
          .from(supplierQuotations)
          .where(inArray(supplierQuotations.rfqId, rfqIds))
      : [],
    sourcingIds.length
      ? db
          .select({
            id: commercialEvaluations.id,
            sourcingRequestId: commercialEvaluations.sourcingRequestId,
            status: commercialEvaluations.status,
          })
          .from(commercialEvaluations)
          .where(inArray(commercialEvaluations.sourcingRequestId, sourcingIds))
      : [],
    caseIds.length
      ? db
          .select({
            id: purchaseOrders.id,
            poNumber: purchaseOrders.poNumber,
            status: purchaseOrders.status,
            procurementCaseId: purchaseOrders.procurementCaseId,
            readyForPickupAt: purchaseOrders.readyForPickupAt,
            orderedAt: purchaseOrders.orderedAt,
            supplierName: suppliers.name,
          })
          .from(purchaseOrders)
          .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
          .where(inArray(purchaseOrders.procurementCaseId, caseIds))
      : [],
  ])

  const evaluationIds = evaluations.map((e) => e.id)
  const poIds = poRows.map((p) => p.id)

  const [approvals, poLines, pickupTasks] = await Promise.all([
    evaluationIds.length
      ? db
          .select({
            id: commercialApprovals.id,
            evaluationId: commercialApprovals.evaluationId,
            decision: commercialApprovals.decision,
          })
          .from(commercialApprovals)
          .where(inArray(commercialApprovals.evaluationId, evaluationIds))
      : [],
    poIds.length
      ? db
          .select({
            id: purchaseOrderLines.id,
            purchaseOrderId: purchaseOrderLines.purchaseOrderId,
            qtyOrdered: purchaseOrderLines.qtyOrdered,
            qtyReceived: purchaseOrderLines.qtyReceived,
            status: purchaseOrderLines.status,
          })
          .from(purchaseOrderLines)
          .where(inArray(purchaseOrderLines.purchaseOrderId, poIds))
      : [],
    poIds.length
      ? db
          .select({
            id: partnerTasks.id,
            purchaseOrderId: partnerTasks.purchaseOrderId,
            status: partnerTasks.status,
          })
          .from(partnerTasks)
          .where(and(eq(partnerTasks.kind, "supplier_pickup"), inArray(partnerTasks.purchaseOrderId, poIds)))
      : [],
  ])

  // ── Units: order-origin + PO-origin ─────────────────────────────────────────
  const [orderOriginUnits, poOriginUnits] = await Promise.all([
    db
      .select({
        id: orderUnits.id,
        serialNumber: orderUnits.serialNumber,
        assetTag: orderUnits.assetTag,
        status: orderUnits.status,
        location: orderUnits.location,
        orderLineId: orderUnits.orderLineId,
        description: orderLines.description,
      })
      .from(orderUnits)
      .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
      .where(eq(orderUnits.orderId, orderId)),
    poIds.length
      ? db
          .select({
            id: orderUnits.id,
            serialNumber: orderUnits.serialNumber,
            assetTag: orderUnits.assetTag,
            status: orderUnits.status,
            location: orderUnits.location,
            purchaseOrderId: orderUnits.purchaseOrderId,
            description: purchaseOrderLines.itemDescription,
          })
          .from(orderUnits)
          .innerJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
          .where(inArray(orderUnits.purchaseOrderId, poIds))
      : [],
  ])

  // Merge, de-duping (a PO-origin unit can also carry the orderId once assigned).
  const unitMap = new Map<
    string,
    { id: string; serialNumber: string | null; assetTag: string | null; status: string; location: string; description: string | null; purchaseOrderId?: string | null }
  >()
  for (const u of orderOriginUnits) unitMap.set(u.id, u)
  for (const u of poOriginUnits) if (!unitMap.has(u.id)) unitMap.set(u.id, u)
  const allUnits = [...unitMap.values()]
  const unitIds = allUnits.map((u) => u.id)

  // ── Field jobs pulling these units, with tasks + signatures ────────────────
  const jobLinks = unitIds.length
    ? await db
        .select({ requestId: requestItems.requestId, orderUnitId: requestItems.orderUnitId })
        .from(requestItems)
        .where(inArray(requestItems.orderUnitId, unitIds))
    : []
  const jobIds = [...new Set(jobLinks.map((l) => l.requestId))]

  const [jobRows, jobTasks, signatureRows] = await Promise.all([
    jobIds.length
      ? db
          .select({
            id: requests.id,
            requestNumber: requests.requestNumber,
            status: requests.status,
            typeSlug: requestTypes.slug,
            typeName: requestTypes.nameEn,
            typeNameAr: requestTypes.nameAr,
            receiverContactId: requests.receiverContactId,
            createdAt: requests.createdAt,
          })
          .from(requests)
          .leftJoin(requestTypes, eq(requests.typeId, requestTypes.id))
          .where(and(inArray(requests.id, jobIds), isNull(requests.deletedAt)))
      : [],
    jobIds.length
      ? db
          .select({
            id: partnerTasks.id,
            requestId: partnerTasks.requestId,
            status: partnerTasks.status,
            closedAt: partnerTasks.closedAt,
            partnerName: partners.name,
            createdAt: partnerTasks.createdAt,
          })
          .from(partnerTasks)
          .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
          .where(inArray(partnerTasks.requestId, jobIds))
      : [],
    jobIds.length
      ? db
          .select({
            id: signatureRequests.id,
            requestId: signatureRequests.requestId,
            documentName: signatureRequests.documentName,
            signatoryRole: signatureRequests.signatoryRole,
            signatoryContactId: signatureRequests.signatoryContactId,
            status: signatureRequests.status,
            createdAt: signatureRequests.createdAt,
          })
          .from(signatureRequests)
          .where(inArray(signatureRequests.requestId, jobIds))
      : [],
  ])

  const taskIds = jobTasks.map((t) => t.id)

  // ── Payments + batches for these tasks ─────────────────────────────────────
  const paymentRows = taskIds.length
    ? await db
        .select({
          id: partnerPayments.id,
          partnerTaskId: partnerPayments.partnerTaskId,
          partnerId: partnerPayments.partnerId,
          partnerName: partners.name,
          totalAmount: partnerPayments.totalAmount,
          status: partnerPayments.status,
          batchId: partnerPayments.batchId,
          createdAt: partnerPayments.createdAt,
        })
        .from(partnerPayments)
        .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
        .where(inArray(partnerPayments.partnerTaskId, taskIds))
    : []
  const batchIds = [...new Set(paymentRows.map((p) => p.batchId).filter((v): v is string => Boolean(v)))]
  const batchRows = batchIds.length
    ? await db
        .select({ id: paymentBatches.id, status: paymentBatches.status })
        .from(paymentBatches)
        .where(inArray(paymentBatches.id, batchIds))
    : []
  const batchStatusById = new Map(batchRows.map((b) => [b.id, b.status]))

  // ── Attachments + merged activity timeline ─────────────────────────────────
  const attachmentConditions = [
    jobIds.length ? and(eq(attachments.entityType, "request"), inArray(attachments.entityId, jobIds)) : null,
    taskIds.length ? and(eq(attachments.entityType, "partner_task"), inArray(attachments.entityId, taskIds)) : null,
    signatureRows.length
      ? and(eq(attachments.entityType, "signature_request"), inArray(attachments.entityId, signatureRows.map((s) => s.id)))
      : null,
    poIds.length ? and(eq(attachments.entityType, "purchase_order"), inArray(attachments.entityId, poIds)) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  const activityConditions = [
    jobIds.length ? and(eq(activityLogs.entityType, "request"), inArray(activityLogs.entityId, jobIds)) : null,
    taskIds.length ? and(eq(activityLogs.entityType, "partner_task"), inArray(activityLogs.entityId, taskIds)) : null,
    signatureRows.length
      ? and(eq(activityLogs.entityType, "signature_request"), inArray(activityLogs.entityId, signatureRows.map((s) => s.id)))
      : null,
    poIds.length ? and(eq(activityLogs.entityType, "purchase_order"), inArray(activityLogs.entityId, poIds)) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  const [attachmentGroups, activityGroups] = await Promise.all([
    Promise.all(
      attachmentConditions.map((cond) =>
        db
          .select({
            id: attachments.id,
            entityType: attachments.entityType,
            fileName: attachments.fileName,
            fileUrl: attachments.fileUrl,
            fileType: attachments.fileType,
            createdAt: attachments.createdAt,
          })
          .from(attachments)
          .where(cond)
      )
    ),
    Promise.all(
      activityConditions.map((cond) =>
        db
          .select({
            id: activityLogs.id,
            entityType: activityLogs.entityType,
            i18nKey: activityLogs.i18nKey,
            createdAt: activityLogs.createdAt,
          })
          .from(activityLogs)
          .where(cond)
          .orderBy(desc(activityLogs.createdAt))
          .limit(TIMELINE_CAP)
      )
    ),
  ])

  const allAttachments: WorkspaceAttachment[] = attachmentGroups
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt)

  const timeline: WorkspaceTimelineEntry[] = activityGroups
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, TIMELINE_CAP)

  // ── Assemble summaries ──────────────────────────────────────────────────────
  const quotationsByRfq = new Map<string, number>()
  for (const q of quotations) {
    if (q.status === "cancelled" || q.status === "superseded") continue
    quotationsByRfq.set(q.rfqId, (quotationsByRfq.get(q.rfqId) ?? 0) + 1)
  }
  const approvedEvaluationIds = new Set(
    approvals.filter((a) => a.decision === "approved").map((a) => a.evaluationId)
  )

  const sourcingSummaries: WorkspaceSourcing[] = sourcingRows.map((s) => {
    const myItems = items.filter((i) => i.sourcingRequestId === s.id && i.status !== "cancelled")
    const myRfqs = rfqs.filter((r) => r.sourcingRequestId === s.id)
    const quotationCount = myRfqs.reduce((acc, r) => acc + (quotationsByRfq.get(r.id) ?? 0), 0)
    const activeEvaluations = evaluations.filter(
      (e) => e.sourcingRequestId === s.id && e.status === "active"
    )
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      itemCount: myItems.length,
      rfqCount: myRfqs.length,
      quotationCount,
      hasActiveAward: activeEvaluations.length > 0,
      hasApprovedApproval: activeEvaluations.some((e) => approvedEvaluationIds.has(e.id)),
      createdAt: s.createdAt,
    }
  })

  const poByCase = new Map(poRows.map((p) => [p.procurementCaseId, p]))
  const erpReferences: WorkspaceErpReference[] = cases.map((c) => ({
    id: c.id,
    status: c.status,
    supplierName: c.supplierName,
    erpSystem: c.erpSystem,
    externalPoRef: c.externalPoRef,
    updatedAt: c.updatedAt,
    poId: poByCase.get(c.id)?.id ?? null,
  }))

  const linesByPo = new Map<string, { qtyOrdered: number; qtyReceived: number }>()
  for (const l of poLines) {
    if (l.status === "cancelled") continue
    const agg = linesByPo.get(l.purchaseOrderId) ?? { qtyOrdered: 0, qtyReceived: 0 }
    agg.qtyOrdered += l.qtyOrdered
    agg.qtyReceived += l.qtyReceived
    linesByPo.set(l.purchaseOrderId, agg)
  }

  const poSummaries: WorkspacePurchaseOrder[] = poRows.map((p) => ({
    id: p.id,
    poNumber: p.poNumber,
    status: p.status,
    supplierName: p.supplierName,
    qtyOrdered: linesByPo.get(p.id)?.qtyOrdered ?? 0,
    qtyReceived: linesByPo.get(p.id)?.qtyReceived ?? 0,
    orderedAt: p.orderedAt,
  }))

  const workspaceUnits: WorkspaceUnit[] = allUnits.map((u) => ({
    id: u.id,
    serialNumber: u.serialNumber,
    assetTag: u.assetTag,
    status: u.status,
    location: u.location,
    description: u.description ?? "—",
    customerDescription: null,
  }))

  const itemCountByJob = new Map<string, number>()
  for (const l of jobLinks) itemCountByJob.set(l.requestId, (itemCountByJob.get(l.requestId) ?? 0) + 1)

  const tasksByJob = new Map<string, typeof jobTasks>()
  for (const t of jobTasks) {
    if (!t.requestId) continue
    const list = tasksByJob.get(t.requestId) ?? []
    list.push(t)
    tasksByJob.set(t.requestId, list)
  }

  const contactById = new Map(contacts.map((c) => [c.id, c]))
  const signaturesByJob = new Map<string, typeof signatureRows>()
  for (const s of signatureRows) {
    if (!s.requestId) continue
    const list = signaturesByJob.get(s.requestId) ?? []
    list.push(s)
    signaturesByJob.set(s.requestId, list)
  }

  const jobKind = (slug: string | null): "delivery" | "collection" | "other" =>
    slug === "collection" ? "collection" : slug === "delivery" ? "delivery" : "other"

  const jobSummaries: WorkspaceJob[] = jobRows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => {
      const tasks = (tasksByJob.get(j.id) ?? []).sort((a, b) => b.createdAt - a.createdAt)
      return {
        id: j.id,
        requestNumber: j.requestNumber,
        kind: jobKind(j.typeSlug),
        typeName: j.typeName,
        typeNameAr: j.typeNameAr,
        status: j.status,
        itemCount: itemCountByJob.get(j.id) ?? 0,
        partnerName: tasks[0]?.partnerName ?? null,
        taskStatus: tasks[0]?.status ?? null,
        createdAt: j.createdAt,
      }
    })

  // ── Facts ────────────────────────────────────────────────────────────────────
  const rentalEndAt = deriveRentalEnd(order)
  const now = Date.now()
  const currentPeriod = periodOf(now)

  const statusCount = (status: string) => allUnits.filter((u) => u.status === status).length
  const requestedQty = lines.reduce((acc, l) => acc + l.quantity, 0)
  const activeSourcingIds = new Set(
    sourcingRows.filter((s) => s.status !== "cancelled").map((s) => s.id)
  )
  const sourcedQty = items
    .filter((i) => activeSourcingIds.has(i.sourcingRequestId) && i.status !== "cancelled" && i.status !== "not_sourced")
    .reduce((acc, i) => acc + i.quantity, 0)
  const stockAssignedQty = orderOriginUnits.length

  const openPickupByPo = new Set(
    pickupTasks
      .filter((t) => OPEN_TASK_STATUSES.includes(t.status))
      .map((t) => t.purchaseOrderId)
      .filter((v): v is string => Boolean(v))
  )
  const qcByPo = new Map<string, number>()
  for (const u of poOriginUnits) {
    if (u.status === "receiving_qc" && u.purchaseOrderId) {
      qcByPo.set(u.purchaseOrderId, (qcByPo.get(u.purchaseOrderId) ?? 0) + 1)
    }
  }

  const jobFacts: WorkspaceFacts["jobs"] = jobRows.map((j) => {
    const tasks = tasksByJob.get(j.id) ?? []
    const sigs = signaturesByJob.get(j.id) ?? []
    const receiverSigned = sigs.some((s) => {
      if (s.signatoryRole !== "receiver" || s.status !== "signed") return false
      const contact = s.signatoryContactId ? contactById.get(s.signatoryContactId) : null
      return !contact?.isAuthorizedSignatory
    })
    const hasAuthorizedStage = sigs.some((s) => s.signatoryRole === "authorized")
    return {
      id: j.id,
      kind: jobKind(j.typeSlug),
      status: j.status as WorkspaceFacts["jobs"][number]["status"],
      hasTask: tasks.length > 0,
      taskStatuses: tasks.map((t) => t.status),
      needsAuthorizedSignature: receiverSigned && !hasAuthorizedStage,
    }
  })

  const closedAtByTask = new Map(jobTasks.map((t) => [t.id, t.closedAt]))
  const unbatched = paymentRows
    .filter((p) => p.status === "pending" && !p.batchId)
    .map((p) => {
      const closedAt = closedAtByTask.get(p.partnerTaskId) ?? p.createdAt
      const period = periodOf(closedAt ?? p.createdAt)
      return { taskId: p.partnerTaskId, partnerId: p.partnerId, period, monthClosed: period < currentPeriod }
    })
  const draftBatches = batchRows.filter((b) => b.status === "draft").map((b) => ({ id: b.id }))

  const facts: WorkspaceFacts = {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      rentalEndAt,
    },
    demand: { requestedQty, sourcedQty, stockAssignedQty },
    sourcing: sourcingSummaries.map((s) => ({
      id: s.id,
      status: s.status as WorkspaceFacts["sourcing"][number]["status"],
      itemCount: s.itemCount,
      rfqs: rfqs
        .filter((r) => r.sourcingRequestId === s.id)
        .map((r) => ({ id: r.id, status: r.status, quotationCount: quotationsByRfq.get(r.id) ?? 0 })),
      quotationCount: s.quotationCount,
      hasActiveAward: s.hasActiveAward,
      hasApprovedApproval: s.hasApprovedApproval,
    })),
    erpReferences: cases.map((c) => ({
      id: c.id,
      status: c.status,
      hasErpRef: Boolean(c.externalPoRef),
      hasPurchaseOrder: poByCase.has(c.id),
    })),
    purchaseOrders: poRows.map((p) => ({
      id: p.id,
      poNumber: p.poNumber,
      status: p.status,
      qtyOrdered: linesByPo.get(p.id)?.qtyOrdered ?? 0,
      qtyReceived: linesByPo.get(p.id)?.qtyReceived ?? 0,
      readyForPickup: Boolean(p.readyForPickupAt),
      hasOpenPickupTask: openPickupByPo.has(p.id),
      qcPendingCount: qcByPo.get(p.id) ?? 0,
    })),
    units: {
      total: allUnits.length,
      qcPending: statusCount("receiving_qc"),
      inStock: statusCount("in_stock"),
      delivered: statusCount("delivered"),
      returned: statusCount("returned"),
      retired: statusCount("retired"),
    },
    jobs: jobFacts,
    payments: { unbatched, draftBatches },
    now,
  }

  const deliveryJobs = jobFacts.filter((j) => j.kind !== "collection")
  const collectionJobs = jobFacts.filter((j) => j.kind === "collection")

  const journey = deriveRequestJourney({
    orderStatus: order.status,
    sourcing: {
      requestCount: sourcingRows.length,
      anyHandedOff: sourcingRows.some((s) => s.status === "handed_off"),
    },
    purchasing: {
      caseCount: cases.length,
      poCount: poRows.length,
      orderedQty: [...linesByPo.values()].reduce((acc, l) => acc + l.qtyOrdered, 0),
    },
    receivedCount: [...linesByPo.values()].reduce((acc, l) => acc + l.qtyReceived, 0),
    qcPendingCount: facts.units.qcPending,
    inStockCount: facts.units.inStock,
    unitCount: facts.units.total,
    deliveredUnitCount: facts.units.delivered,
    returnedUnitCount: facts.units.returned,
    deliveryJobCount: deliveryJobs.length,
    anyDeliveryCompleted: deliveryJobs.some((j) => j.status === "completed"),
    collectionJobCount: collectionJobs.length,
    anyCollectionCompleted: collectionJobs.some((j) => j.status === "completed"),
    rentalEndAt,
  })

  const nextActions = deriveNextActions(facts)

  const deliveredByLine = new Map<string, number>()
  const unitsByLine = new Map<string, number>()
  for (const u of orderOriginUnits) {
    if (!u.orderLineId) continue
    unitsByLine.set(u.orderLineId, (unitsByLine.get(u.orderLineId) ?? 0) + 1)
    if (u.status === "delivered") {
      deliveredByLine.set(u.orderLineId, (deliveredByLine.get(u.orderLineId) ?? 0) + 1)
    }
  }

  return {
    order,
    customer: customer ?? null,
    contacts,
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      brand: l.brand,
      model: l.model,
      quantity: l.quantity,
      rentalMonths: l.rentalMonths,
      unitPriceMonthly: l.unitPriceMonthly,
      notes: l.notes,
      unitCount: unitsByLine.get(l.id) ?? 0,
      deliveredCount: deliveredByLine.get(l.id) ?? 0,
    })),
    sourcing: sourcingSummaries,
    erpReferences,
    purchaseOrders: poSummaries,
    units: workspaceUnits,
    jobs: jobSummaries,
    signatures: signatureRows.map((s) => ({
      id: s.id,
      requestId: s.requestId,
      documentName: s.documentName,
      signatoryRole: s.signatoryRole,
      status: s.status,
      createdAt: s.createdAt,
    })),
    attachments: allAttachments,
    payments: paymentRows.map((p) => ({
      id: p.id,
      partnerName: p.partnerName,
      totalAmount: p.totalAmount,
      status: p.status,
      batchId: p.batchId,
      batchStatus: p.batchId ? batchStatusById.get(p.batchId) ?? null : null,
      createdAt: p.createdAt,
    })),
    timeline,
    rentalEndAt,
    journey,
    nextActions,
    primaryActions: primaryActionsPerTrack(nextActions),
  }
}
