"use server"

// Sourcing V3: cross-request consolidation. Entry point 2 into sourcing —
// alongside the existing per-request "create RFQ from this request" flow in
// lib/actions/sourcing.ts. This lets ops pull every pending item across ALL
// open sourcing requests (any customer) and send ONE RFQ to ONE supplier for
// a mixed set, instead of being forced into one RFQ per request. Downstream
// (quotation/award/case) already forks correctly once items are
// supplier-grouped — no changes needed there.
import { and, eq, inArray } from "drizzle-orm"
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  sourcingRequests,
  sourcingRequestItems,
  supplierRfqs,
  supplierRfqItems,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { canIncludeItemInRfq, type SourcingItemStatus } from "@/lib/domain/sourcing-item-status"

type ActionResult = { error?: string; id?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = SQLiteTransaction<any, any, any, any>

// ─── Unsourced items — every pending item across every open request ────────

export type UnsourcedItem = {
  id: string
  sourcingRequestId: string
  requestExternalRef: string | null
  requestTitle: string | null
  quantity: number
  customerDescription: string
  supplierDescription: string
  partNumber: string | null
  createdAt: number
}

export async function getUnsourcedItems(): Promise<UnsourcedItem[]> {
  const session = await getStaffSession()
  if (!session) return []

  return db
    .select({
      id: sourcingRequestItems.id,
      sourcingRequestId: sourcingRequestItems.sourcingRequestId,
      requestExternalRef: sourcingRequests.externalRef,
      requestTitle: sourcingRequests.title,
      quantity: sourcingRequestItems.quantity,
      customerDescription: sourcingRequestItems.customerDescription,
      supplierDescription: sourcingRequestItems.supplierDescription,
      partNumber: sourcingRequestItems.partNumber,
      createdAt: sourcingRequestItems.createdAt,
    })
    .from(sourcingRequestItems)
    .innerJoin(sourcingRequests, eq(sourcingRequests.id, sourcingRequestItems.sourcingRequestId))
    .where(
      and(
        eq(sourcingRequestItems.status, "pending"),
        inArray(sourcingRequests.status, ["draft", "rfq_sent", "quotes_received"])
      )
    )
    .orderBy(sourcingRequestItems.createdAt)
}

// ─── Send one consolidated RFQ (items from any mix of requests) ────────────
// Mirrors sendSupplierRfqs (lib/actions/sourcing.ts) but is not scoped to a
// single sourcingRequestId — item∈request is derived per-item instead of
// checked against one shared request. The created supplier_rfq row leaves
// sourcingRequestId null (Sourcing V3 schema change), since it may span many.

const sendConsolidatedRfqSchema = z.object({
  supplierId: z.string().trim().min(1),
  itemIds: z.array(z.string().trim().min(1)).min(1).max(200),
})

export type SendConsolidatedRfqInput = z.infer<typeof sendConsolidatedRfqSchema>

export async function sendConsolidatedSupplierRfqCore(
  tx: Tx,
  input: SendConsolidatedRfqInput,
  actorUserId: string
): Promise<{ rfqId: string; affectedRequestIds: string[] }> {
  const uniqueItemIds = [...new Set(input.itemIds)]

  const [supplier] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.supplierId))
  if (!supplier) throw new Error("Supplier not found")

  const items = await tx
    .select({
      id: sourcingRequestItems.id,
      status: sourcingRequestItems.status,
      sourcingRequestId: sourcingRequestItems.sourcingRequestId,
    })
    .from(sourcingRequestItems)
    .where(inArray(sourcingRequestItems.id, uniqueItemIds))
  if (items.length !== uniqueItemIds.length) {
    throw new Error("One or more items were not found")
  }
  const blocked = items.filter((i) => !canIncludeItemInRfq(i.status as SourcingItemStatus))
  if (blocked.length > 0) throw new Error("One or more items are cancelled")

  const requestIds = [...new Set(items.map((i) => i.sourcingRequestId))]
  const requests = await tx
    .select({ id: sourcingRequests.id, status: sourcingRequests.status })
    .from(sourcingRequests)
    .where(inArray(sourcingRequests.id, requestIds))
  const closed = requests.filter((r) => ["cancelled", "closed"].includes(r.status))
  if (closed.length > 0) throw new Error("One or more items belong to a closed request")

  const rfqId = createId()
  await tx.insert(supplierRfqs).values({
    id: rfqId,
    sourcingRequestId: null,
    supplierId: input.supplierId,
  })
  for (const itemId of uniqueItemIds) {
    await tx.insert(supplierRfqItems).values({
      id: createId(),
      rfqId,
      sourcingRequestItemId: itemId,
    })
  }
  await emitDomainEvent(tx, {
    aggregateType: "supplier_rfq",
    aggregateId: rfqId,
    eventType: "SupplierRfqSent",
    payload: { supplierId: input.supplierId, itemIds: uniqueItemIds, requestIds },
    dedupeKey: `supplier_rfq:${rfqId}:SupplierRfqSent`,
    actorUserId,
  })

  await tx
    .update(sourcingRequestItems)
    .set({ status: "rfq_sent", updatedAt: Date.now() })
    .where(and(inArray(sourcingRequestItems.id, uniqueItemIds), eq(sourcingRequestItems.status, "pending")))

  const draftRequestIds = requests.filter((r) => r.status === "draft").map((r) => r.id)
  if (draftRequestIds.length > 0) {
    await tx
      .update(sourcingRequests)
      .set({ status: "rfq_sent", updatedAt: Date.now() })
      .where(inArray(sourcingRequests.id, draftRequestIds))
  }

  return { rfqId, affectedRequestIds: requestIds }
}

export async function sendConsolidatedSupplierRfq(input: SendConsolidatedRfqInput): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = sendConsolidatedRfqSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let result: { rfqId: string; affectedRequestIds: string[] }
  try {
    result = await db.transaction((tx) => sendConsolidatedSupplierRfqCore(tx, parsed.data, session.user.id))
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send consolidated RFQ" }
  }

  revalidatePath("/admin/sourcing/unsourced")
  for (const requestId of result.affectedRequestIds) {
    revalidatePath(`/admin/sourcing/${requestId}`)
  }
  return { id: result.rfqId }
}
