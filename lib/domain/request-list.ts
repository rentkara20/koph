// Query building for the admin requests list.
//
// Lives outside lib/actions/requests.ts because that file is a "use server"
// module, and Next.js only allows async function exports there — the constant,
// the type guard and the sync condition builder below cannot be exported from
// it. Keeping them here also makes them directly testable against a temp DB.
import { and, count, eq, inArray, sql } from "drizzle-orm"
import type { db as Db } from "@/lib/db"
import {
  deliveryTaskItems,
  partners,
  partnerTasks,
  requestItems,
  requests,
  signatureRequests,
} from "@/lib/db/schema"
import { parseRiyadhDate, toDateInputValue } from "@/lib/utils/format"

type Database = typeof Db | Parameters<Parameters<typeof Db.transaction>[0]>[0]

// Quick filters on the requests list. Deliberately answers "what needs me?"
// rather than "what state is it in?" — status alone cannot express overdue or
// unassigned, which are the two conditions that actually cost the business.
export const REQUEST_VIEWS = ["unassigned", "overdue", "today", "needs_signature"] as const
export type RequestView = (typeof REQUEST_VIEWS)[number]

export function isRequestView(value: string | undefined): value is RequestView {
  return !!value && (REQUEST_VIEWS as readonly string[]).includes(value)
}

// Statuses where no further operational action is expected. Used by the
// unassigned/overdue views so closed history never pollutes a worklist.
const OPEN_STATUS_SQL = sql`${requests.status} not in ('completed', 'cancelled', 'failed')`

// Collection-type requests carry their date in collection_date, delivery-type
// in delivery_date. Every date-based view and the list's date column read this
// so a collection request is not treated as undated.
const EFFECTIVE_DATE_SQL = sql`coalesce(${requests.deliveryDate}, ${requests.collectionDate})`

// A task reaches a request through two signals, matching getTasksForRequest and
// syncRequestStatus: its own request_id (legacy / single-request tasks) or a
// delivery_task_item row (Delivery Batching v2, where one task spans requests).
// Missing the second signal would report a batched request as unassigned.
const HAS_TASK_SQL = sql`(
  exists (select 1 from partner_task pt where pt.request_id = ${requests.id})
  or exists (
    select 1 from delivery_task_item dti
    join request_item ri on ri.id = dti.request_item_id
    where ri.request_id = ${requests.id}
  )
)`

export function requestViewCondition(view: RequestView, now: number = Date.now()) {
  // Normalising through the Riyadh calendar day (not `now` directly) is what
  // makes "today" mean the whole business day rather than the next 24 hours.
  const todayStart = parseRiyadhDate(toDateInputValue(now))!
  const tomorrowStart = todayStart + 86_400_000

  switch (view) {
    case "unassigned":
      return and(sql`not ${HAS_TASK_SQL}`, OPEN_STATUS_SQL)
    case "overdue":
      return and(
        sql`${EFFECTIVE_DATE_SQL} is not null and ${EFFECTIVE_DATE_SQL} < ${todayStart}`,
        OPEN_STATUS_SQL
      )
    case "today":
      return sql`${EFFECTIVE_DATE_SQL} >= ${todayStart} and ${EFFECTIVE_DATE_SQL} < ${tomorrowStart}`
    case "needs_signature":
      return and(
        eq(requests.status, "completed"),
        sql`not exists (
          select 1 from signature_request sr
          where sr.request_id = ${requests.id} and sr.status = 'signed'
        )`
      )
  }
}

export type RequestRowEnrichment = {
  partnerNames: string[]
  taskCount: number
  itemCount: number
  itemQuantity: number
  hasPendingSignoff: boolean
  hasSignedSignature: boolean
  hasAnySignature: boolean
}

// A factory, not a shared constant: spreading a constant would give every row
// the SAME partnerNames array, so one request's partners would appear on all of
// them.
const emptyEnrichment = (): RequestRowEnrichment => ({
  partnerNames: [],
  taskCount: 0,
  itemCount: 0,
  itemQuantity: 0,
  hasPendingSignoff: false,
  hasSignedSignature: false,
  hasAnySignature: false,
})

// Second pass over one page of requests (≤ REQUESTS_PAGE_SIZE ids): four
// bounded IN-list queries instead of per-row lookups, so the list costs a fixed
// number of queries regardless of page size.
export async function enrichRequestRows(
  database: Database,
  ids: string[]
): Promise<Map<string, RequestRowEnrichment>> {
  const result = new Map<string, RequestRowEnrichment>()
  if (ids.length === 0) return result

  const taskColumns = {
    taskId: partnerTasks.id,
    partnerName: partners.name,
    status: partnerTasks.status,
  }

  const [directTasks, batchedTasks, itemRows, signatureRows] = await Promise.all([
    // Signal 1: the task's own request_id.
    database
      .select({ ...taskColumns, requestId: partnerTasks.requestId })
      .from(partnerTasks)
      .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .where(inArray(partnerTasks.requestId, ids)),
    // Signal 2: batched tasks, reached through their delivery_task_item rows.
    database
      .selectDistinct({ ...taskColumns, requestId: requestItems.requestId })
      .from(partnerTasks)
      .innerJoin(deliveryTaskItems, eq(deliveryTaskItems.partnerTaskId, partnerTasks.id))
      .innerJoin(requestItems, eq(requestItems.id, deliveryTaskItems.requestItemId))
      .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
      .where(inArray(requestItems.requestId, ids)),
    database
      .select({
        requestId: requestItems.requestId,
        itemCount: count(),
        itemQuantity: sql<number>`coalesce(sum(${requestItems.quantity}), 0)`,
      })
      .from(requestItems)
      .where(inArray(requestItems.requestId, ids))
      .groupBy(requestItems.requestId),
    database
      .select({ requestId: signatureRequests.requestId, status: signatureRequests.status })
      .from(signatureRequests)
      .where(inArray(signatureRequests.requestId, ids)),
  ])

  for (const id of ids) result.set(id, emptyEnrichment())

  const seenTasks = new Map<string, Set<string>>()
  for (const row of [...directTasks, ...batchedTasks]) {
    const entry = row.requestId ? result.get(row.requestId) : undefined
    if (!entry || !row.requestId) continue
    // A batched task can also carry request_id, so the same task can arrive
    // from both signals — dedupe or taskCount double-counts it.
    const seen = seenTasks.get(row.requestId) ?? new Set<string>()
    if (seen.has(row.taskId)) continue
    seen.add(row.taskId)
    seenTasks.set(row.requestId, seen)

    entry.taskCount += 1
    if (row.status === "pending_signoff") entry.hasPendingSignoff = true
    // Distinct names: a request batched across two trips by the same partner
    // should read as one name, not "Partner +1".
    if (row.partnerName && !entry.partnerNames.includes(row.partnerName)) {
      entry.partnerNames.push(row.partnerName)
    }
  }

  for (const row of itemRows) {
    const entry = result.get(row.requestId)
    if (!entry) continue
    entry.itemCount = row.itemCount
    entry.itemQuantity = Number(row.itemQuantity)
  }

  for (const row of signatureRows) {
    const entry = row.requestId ? result.get(row.requestId) : undefined
    if (!entry) continue
    entry.hasAnySignature = true
    if (row.status === "signed") entry.hasSignedSignature = true
  }

  return result
}
