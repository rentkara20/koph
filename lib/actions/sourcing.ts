"use server"

// Sourcing (Milestone 4.5 / P4a). A Sourcing Request captures a Need — from a
// customer order, internal stock replenishment, or an internal operational
// need — and is the root of the commercial chain: Sourcing Request → RFQ →
// Quotation → Evaluation → Approval → Procurement Case (lib/actions/
// commercial-approval.ts, lib/actions/procurement-case.ts). No delete action
// is exposed on any row here — only status transitions.
import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { sourcingRequests, supplierRfqs, suppliers } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"

type ActionResult = { error?: string; id?: string }

// ─── Create sourcing request ─────────────────────────────────────────────────

const createSourcingRequestSchema = z.object({
  sourceType: z.enum(["customer_order", "stock_replenishment", "operational_need"]),
  orderId: z.string().trim().min(1).optional(),
  orderLineId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).max(2000),
})

export async function createSourcingRequest(
  input: z.infer<typeof createSourcingRequestSchema>
): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = createSourcingRequestSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data
  if (d.sourceType !== "customer_order" && (d.orderId || d.orderLineId)) {
    return { error: "orderId/orderLineId only apply to sourceType=customer_order" }
  }

  const id = createId()
  await db.transaction(async (tx) => {
    await tx.insert(sourcingRequests).values({
      id,
      sourceType: d.sourceType,
      orderId: d.orderId ?? null,
      orderLineId: d.orderLineId ?? null,
      description: d.description,
      createdBy: session.user.id,
    })
    await emitDomainEvent(tx, {
      aggregateType: "sourcing_request",
      aggregateId: id,
      eventType: "SourcingRequestCreated",
      payload: { sourceType: d.sourceType, orderId: d.orderId ?? null },
      dedupeKey: `sourcing_request:${id}:SourcingRequestCreated`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath("/admin/sourcing")
  return { id }
}

// ─── Send RFQs to suppliers ───────────────────────────────────────────────────

const sendRfqsSchema = z.object({
  sourcingRequestId: z.string().trim().min(1),
  supplierIds: z.array(z.string().trim().min(1)).min(1),
})

export async function sendSupplierRfqs(input: z.infer<typeof sendRfqsSchema>): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = sendRfqsSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  await db.transaction(async (tx) => {
    const [request] = await tx
      .select({ status: sourcingRequests.status })
      .from(sourcingRequests)
      .where(eq(sourcingRequests.id, d.sourcingRequestId))
    if (!request) throw new Error("Sourcing request not found")

    for (const supplierId of d.supplierIds) {
      const rfqId = createId()
      await tx.insert(supplierRfqs).values({
        id: rfqId,
        sourcingRequestId: d.sourcingRequestId,
        supplierId,
      })
      await emitDomainEvent(tx, {
        aggregateType: "supplier_rfq",
        aggregateId: rfqId,
        eventType: "SupplierRfqSent",
        payload: { sourcingRequestId: d.sourcingRequestId, supplierId },
        dedupeKey: `supplier_rfq:${rfqId}:SupplierRfqSent`,
        actorUserId: session.user.id,
      })
    }

    if (request.status === "draft") {
      await tx
        .update(sourcingRequests)
        .set({ status: "rfq_sent", updatedAt: Date.now() })
        .where(eq(sourcingRequests.id, d.sourcingRequestId))
    }
  })

  revalidatePath(`/admin/sourcing/${d.sourcingRequestId}`)
  return { id: d.sourcingRequestId }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSourcingRequests() {
  const session = await getStaffSession()
  if (!session) return []
  return db.select().from(sourcingRequests).orderBy(desc(sourcingRequests.createdAt)).limit(200)
}

export async function getSourcingRequest(id: string) {
  const session = await getStaffSession()
  if (!session) return null

  const [request] = await db.select().from(sourcingRequests).where(eq(sourcingRequests.id, id))
  if (!request) return null

  const rfqs = await db
    .select({
      id: supplierRfqs.id,
      supplierId: supplierRfqs.supplierId,
      supplierName: suppliers.name,
      status: supplierRfqs.status,
      sentAt: supplierRfqs.sentAt,
    })
    .from(supplierRfqs)
    .innerJoin(suppliers, eq(supplierRfqs.supplierId, suppliers.id))
    .where(and(eq(supplierRfqs.sourcingRequestId, id)))
    .orderBy(desc(supplierRfqs.sentAt))

  return { request, rfqs }
}
