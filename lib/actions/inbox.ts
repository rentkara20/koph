"use server"

import { and, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  orders,
  partners,
  partnerPayments,
  partnerTasks,
  procurementCases,
  purchaseOrderLines,
  purchaseOrders,
  requests,
  orderUnits,
  sourcingRequests,
  suppliers,
} from "@/lib/db/schema"
import { getStaffSession } from "@/lib/auth/session"

// Role inbox: the "what needs me now" list, grouped by the role that owns the
// next step. Each card is a single, self-contained unit of pending work with
// one primary action. The card's owner mirrors the Next Action engine's
// ownerRole assignments (see lib/domain/next-action.ts) so Home and the
// Request Mission Control never disagree about who owns what.

export type InboxOwner = "procurement" | "warehouse" | "operations" | "finance"

export type InboxCard = {
  key: string
  owner: InboxOwner
  /** i18n key under dashboard.inbox describing what is waiting. */
  waitingKey: string
  /** Primary label i18n key for the action button. */
  actionKey: string
  href: string
  requestRef: string
  customerName: string | null
  /** Epoch ms the item entered this waiting state, for age display. */
  since: number | null
  /** Optional i18n key naming an external blocker (e.g. awaiting ERP PO). */
  blockerKey?: string
}

export type RoleInbox = {
  owner: InboxOwner
  cards: InboxCard[]
}

const LIMIT = 15

export async function getInbox(): Promise<RoleInbox[] | null> {
  const session = await getStaffSession()
  if (!session) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()

  const [
    awaitingQuotes,
    awaitingAward,
    awaitingApproval,
    awaitingErpRef,
    receiving,
    qcQueue,
    signoff,
    overdue,
    unbatched,
  ] = await Promise.all([
    // PROCUREMENT — RFQs sent, no quotes recorded yet
    db
      .select({
        id: sourcingRequests.id,
        orderId: sourcingRequests.orderId,
        title: sourcingRequests.title,
        customerName: customers.name,
        since: sourcingRequests.updatedAt,
      })
      .from(sourcingRequests)
      .leftJoin(orders, eq(sourcingRequests.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(sourcingRequests.status, "rfq_sent"))
      .orderBy(sourcingRequests.updatedAt)
      .limit(LIMIT),
    // PROCUREMENT — quotes in, no award decision yet
    db
      .select({
        id: sourcingRequests.id,
        orderId: sourcingRequests.orderId,
        title: sourcingRequests.title,
        customerName: customers.name,
        since: sourcingRequests.updatedAt,
      })
      .from(sourcingRequests)
      .leftJoin(orders, eq(sourcingRequests.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(sourcingRequests.status, "quotes_received"))
      .orderBy(sourcingRequests.updatedAt)
      .limit(LIMIT),
    // FINANCE — award made, awaiting commercial approval
    db
      .select({
        id: sourcingRequests.id,
        orderId: sourcingRequests.orderId,
        title: sourcingRequests.title,
        customerName: customers.name,
        since: sourcingRequests.updatedAt,
      })
      .from(sourcingRequests)
      .leftJoin(orders, eq(sourcingRequests.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(sourcingRequests.status, "under_evaluation"))
      .orderBy(sourcingRequests.updatedAt)
      .limit(LIMIT),
    // PROCUREMENT — case open, no ERP PO reference linked (external blocker)
    db
      .select({
        id: procurementCases.id,
        sourcingRequestId: procurementCases.sourcingRequestId,
        orderId: sourcingRequests.orderId,
        title: sourcingRequests.title,
        customerName: customers.name,
        since: procurementCases.updatedAt,
      })
      .from(procurementCases)
      .leftJoin(sourcingRequests, eq(procurementCases.sourcingRequestId, sourcingRequests.id))
      .leftJoin(orders, eq(sourcingRequests.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(procurementCases.status, "open"), isNull(procurementCases.externalPoRef)))
      .orderBy(procurementCases.updatedAt)
      .limit(LIMIT),
    // WAREHOUSE — PO lines with quantity still to receive
    db
      .select({
        poId: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        supplierName: suppliers.name,
        since: purchaseOrders.orderedAt,
      })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(
        and(
          ne(purchaseOrderLines.status, "cancelled"),
          lt(purchaseOrderLines.qtyReceived, purchaseOrderLines.qtyOrdered),
          inArray(purchaseOrders.status, ["ordered", "partially_received"])
        )
      )
      .groupBy(purchaseOrders.id)
      .orderBy(purchaseOrders.orderedAt)
      .limit(LIMIT),
    // WAREHOUSE — units awaiting QC after receipt
    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(orderUnits)
      .where(eq(orderUnits.status, "receiving_qc")),
    // OPERATIONS — partner tasks awaiting office sign-off
    db
      .select({
        taskId: partnerTasks.id,
        requestId: partnerTasks.requestId,
        requestNumber: requests.requestNumber,
        customerName: customers.name,
        partnerName: partners.name,
        since: partnerTasks.completedAt,
      })
      .from(partnerTasks)
      .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
      .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .leftJoin(customers, eq(requests.customerId, customers.id))
      .where(and(eq(partnerTasks.status, "pending_signoff"), isNull(requests.deletedAt)))
      .orderBy(desc(partnerTasks.completedAt))
      .limit(LIMIT),
    // OPERATIONS — assigned/in-progress requests past their delivery date
    db
      .select({
        id: requests.id,
        requestNumber: requests.requestNumber,
        customerName: customers.name,
        since: requests.deliveryDate,
      })
      .from(requests)
      .leftJoin(customers, eq(requests.customerId, customers.id))
      .where(
        and(
          isNull(requests.deletedAt),
          lt(requests.deliveryDate, todayTs),
          inArray(requests.status, ["assigned", "in_progress"])
        )
      )
      .orderBy(requests.deliveryDate)
      .limit(LIMIT),
    // FINANCE — partner payments not yet placed in a batch
    db
      .select({
        id: partnerPayments.id,
        partnerId: partnerPayments.partnerId,
        partnerName: partners.name,
        since: partnerPayments.createdAt,
      })
      .from(partnerPayments)
      .leftJoin(partners, eq(partnerPayments.partnerId, partners.id))
      .where(eq(partnerPayments.status, "pending"))
      .orderBy(partnerPayments.createdAt)
      .limit(LIMIT),
  ])

  const sourcingHref = (orderId: string | null, sourcingId: string) =>
    orderId ? `/admin/orders/${orderId}` : `/admin/sourcing/${sourcingId}`

  const procurement: InboxCard[] = [
    ...awaitingQuotes.map((r) => ({
      key: `quotes:${r.id}`,
      owner: "procurement" as const,
      waitingKey: "awaitingQuotes",
      actionKey: "recordQuotation",
      href: sourcingHref(r.orderId, r.id),
      requestRef: r.title ?? "—",
      customerName: r.customerName,
      since: r.since,
    })),
    ...awaitingAward.map((r) => ({
      key: `award:${r.id}`,
      owner: "procurement" as const,
      waitingKey: "awaitingAward",
      actionKey: "awardItems",
      href: sourcingHref(r.orderId, r.id),
      requestRef: r.title ?? "—",
      customerName: r.customerName,
      since: r.since,
    })),
    ...awaitingErpRef.map((r) => ({
      key: `erp:${r.id}`,
      owner: "procurement" as const,
      waitingKey: "awaitingErpRef",
      actionKey: "addErpRef",
      href: r.orderId
        ? `/admin/orders/${r.orderId}`
        : r.sourcingRequestId
          ? `/admin/sourcing/${r.sourcingRequestId}`
          : "/admin/procurement",
      requestRef: r.title ?? "—",
      customerName: r.customerName,
      since: r.since,
      blockerKey: "blockedErpPo",
    })),
  ]

  const warehouse: InboxCard[] = [
    ...receiving.map((r) => ({
      key: `recv:${r.poId}`,
      owner: "warehouse" as const,
      waitingKey: "awaitingReceipt",
      actionKey: "receiveDevices",
      href: `/admin/procurement/${r.poId}`,
      requestRef: r.poNumber ?? "—",
      customerName: r.supplierName,
      since: r.since,
    })),
  ]
  const qcCount = qcQueue[0]?.count ?? 0
  if (qcCount > 0) {
    warehouse.push({
      key: "qc:all",
      owner: "warehouse",
      waitingKey: "awaitingQc",
      actionKey: "qcDevices",
      href: "/admin/procurement/receiving",
      requestRef: `${qcCount}`,
      customerName: null,
      since: null,
    })
  }

  const operations: InboxCard[] = [
    ...signoff.map((r) => ({
      key: `signoff:${r.taskId}`,
      owner: "operations" as const,
      waitingKey: "awaitingSignoff",
      actionKey: "reviewSignoff",
      href: r.requestId ? `/admin/requests/${r.requestId}` : "/admin/requests",
      requestRef: r.requestNumber ?? "—",
      customerName: r.customerName,
      since: r.since,
    })),
    ...overdue.map((r) => ({
      key: `overdue:${r.id}`,
      owner: "operations" as const,
      waitingKey: "overdueDelivery",
      actionKey: "openRequest",
      href: `/admin/requests/${r.id}`,
      requestRef: r.requestNumber ?? "—",
      customerName: r.customerName,
      since: r.since,
      blockerKey: "blockedOverdue",
    })),
  ]

  const finance: InboxCard[] = [
    ...awaitingApproval.map((r) => ({
      key: `approve:${r.id}`,
      owner: "finance" as const,
      waitingKey: "awaitingApproval",
      actionKey: "approveSupplier",
      href: sourcingHref(r.orderId, r.id),
      requestRef: r.title ?? "—",
      customerName: r.customerName,
      since: r.since,
    })),
    ...unbatched.map((r) => ({
      key: `pay:${r.id}`,
      owner: "finance" as const,
      waitingKey: "awaitingBatch",
      actionKey: "generateBatch",
      href: `/admin/payments?partner=${r.partnerId}`,
      requestRef: r.partnerName ?? "—",
      customerName: null,
      since: r.since,
    })),
  ]

  return [
    { owner: "operations", cards: operations },
    { owner: "procurement", cards: procurement },
    { owner: "warehouse", cards: warehouse },
    { owner: "finance", cards: finance },
  ]
}
