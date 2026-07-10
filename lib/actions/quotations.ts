"use server"

// Supplier Quotations (Milestone 4.5 / P4a). A supplier's response to an RFQ.
// Quote Comparison is a computed query over quotations for a sourcing
// request — not its own table (avoids a speculative abstraction).
import { desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  sourcingRequests,
  supplierQuotationLines,
  supplierQuotations,
  supplierRfqs,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"

type ActionResult = { error?: string; id?: string }

// ─── Submit a supplier's quotation against an RFQ ────────────────────────────

const submitQuotationSchema = z.object({
  rfqId: z.string().trim().min(1),
  validUntil: z.number().int().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        itemDescription: z.string().trim().min(1).max(300),
        qty: z.number().int().min(1),
        unitPrice: z.number().min(0).optional(),
        leadTimeDays: z.number().int().min(0).optional(),
      })
    )
    .min(1),
})

export async function submitSupplierQuotation(
  input: z.infer<typeof submitQuotationSchema>
): Promise<ActionResult> {
  const session = await getStaffSession()
  if (!session) return { error: "Unauthorized" }

  const parsed = submitQuotationSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const [rfq] = await db.select().from(supplierRfqs).where(eq(supplierRfqs.id, d.rfqId))
  if (!rfq) return { error: "RFQ not found" }

  const quotationId = createId()
  await db.transaction(async (tx) => {
    await tx.insert(supplierQuotations).values({
      id: quotationId,
      rfqId: d.rfqId,
      validUntil: d.validUntil ?? null,
      notes: d.notes,
    })
    for (const line of d.lines) {
      await tx.insert(supplierQuotationLines).values({
        id: createId(),
        quotationId,
        itemDescription: line.itemDescription,
        qty: line.qty,
        unitPrice: line.unitPrice,
        leadTimeDays: line.leadTimeDays,
      })
    }
    await tx
      .update(supplierRfqs)
      .set({ status: "responded", updatedAt: Date.now() })
      .where(eq(supplierRfqs.id, d.rfqId))

    // First quotation in moves the request out of "waiting on suppliers" and
    // into "ready to evaluate" — without this the evaluation step never
    // unlocks even after every RFQ has responded.
    const [request] = await tx
      .select({ status: sourcingRequests.status })
      .from(sourcingRequests)
      .where(eq(sourcingRequests.id, rfq.sourcingRequestId))
    if (request?.status === "draft" || request?.status === "rfq_sent") {
      await tx
        .update(sourcingRequests)
        .set({ status: "quotes_received", updatedAt: Date.now() })
        .where(eq(sourcingRequests.id, rfq.sourcingRequestId))
    }

    await emitDomainEvent(tx, {
      aggregateType: "supplier_quotation",
      aggregateId: quotationId,
      eventType: "SupplierQuotationSubmitted",
      payload: { rfqId: d.rfqId, lineCount: d.lines.length },
      dedupeKey: `supplier_quotation:${quotationId}:SupplierQuotationSubmitted`,
      actorUserId: session.user.id,
    })
  })

  revalidatePath(`/admin/sourcing/${rfq.sourcingRequestId}`)
  return { id: quotationId }
}

// ─── Quote comparison — all quotations for a sourcing request, with lines ────

export async function getQuotationsForSourcingRequest(sourcingRequestId: string) {
  const session = await getStaffSession()
  if (!session) return []

  const rfqs = await db
    .select({ id: supplierRfqs.id, supplierId: supplierRfqs.supplierId, supplierName: suppliers.name })
    .from(supplierRfqs)
    .innerJoin(suppliers, eq(supplierRfqs.supplierId, suppliers.id))
    .where(eq(supplierRfqs.sourcingRequestId, sourcingRequestId))
  if (rfqs.length === 0) return []

  const rfqIds = rfqs.map((r) => r.id)
  const quotations = await db
    .select()
    .from(supplierQuotations)
    .where(inArray(supplierQuotations.rfqId, rfqIds))
    .orderBy(desc(supplierQuotations.createdAt))
  if (quotations.length === 0) return []

  const quotationIds = quotations.map((q) => q.id)
  const lines = await db
    .select()
    .from(supplierQuotationLines)
    .where(inArray(supplierQuotationLines.quotationId, quotationIds))

  return quotations.map((quotation) => {
    const rfq = rfqs.find((r) => r.id === quotation.rfqId)
    return {
      quotation,
      supplierId: rfq?.supplierId ?? null,
      supplierName: rfq?.supplierName ?? null,
      lines: lines.filter((l) => l.quotationId === quotation.id),
    }
  })
}
