"use server"

// Supplier Quotations (Milestone 4.5 / P4a). A supplier's response to an RFQ.
// Quote Comparison is a computed query over quotations for a sourcing
// request — not its own table (avoids a speculative abstraction).
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  sourcingRequestItems,
  sourcingRequests,
  supplierQuotationLines,
  supplierQuotations,
  supplierRfqItems,
  supplierRfqs,
  suppliers,
} from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession } from "@/lib/auth/session"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { validateQuotationLineItems } from "@/lib/domain/quotation-lines"
import { computeBadges, lineTotal, type ComparisonLine } from "@/lib/domain/sourcing-comparison"

type ActionResult = { error?: string; id?: string }

// ─── Submit a supplier's quotation against an RFQ ────────────────────────────
// Sourcing V2: every quotation line answers a specific request item that this
// RFQ carried (sourcingRequestItemId), so the comparison matrix (Phase 5) can
// line quotes up item-by-item. The offered config (part number + spec +
// upgrades) is what the supplier will actually sell; the delivered config
// stays the item's customerDescription. FK PRAGMA is off, so item∈rfq is
// enforced here in the transaction.

const CURRENCIES = ["SAR", "USD", "AED", "EUR"] as const

const submitQuotationSchema = z.object({
  rfqId: z.string().trim().min(1),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        sourcingRequestItemId: z.string().trim().min(1),
        itemDescription: z.string().trim().min(1).max(300),
        qty: z.number().int().min(1),
        unitPrice: z.number().min(0).optional(),
        currency: z.enum(CURRENCIES).optional(),
        taxRate: z.number().min(0).max(100).optional(),
        leadTimeDays: z.number().int().min(0).optional(),
        availability: z.string().trim().max(300).optional(),
        warranty: z.string().trim().max(300).optional(),
        validUntil: z.number().int().optional(),
        offeredPartNumber: z.string().trim().max(200).optional(),
        offeredSpec: z.string().trim().max(1000).optional(),
        upgradesNote: z.string().trim().max(1000).optional(),
        upgradesCost: z.number().min(0).optional(),
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

  // Integrity: every quoted line must answer an item this RFQ actually
  // carried. FK PRAGMA is off, so this join is the real guard.
  const rfqItemIds = new Set(
    (
      await db
        .select({ itemId: supplierRfqItems.sourcingRequestItemId })
        .from(supplierRfqItems)
        .where(eq(supplierRfqItems.rfqId, d.rfqId))
    ).map((r) => r.itemId)
  )
  const validation = validateQuotationLineItems(d.lines, rfqItemIds)
  if (!validation.ok) {
    return {
      error:
        validation.error === "duplicate_item"
          ? "Duplicate line for the same item"
          : "A quoted item was not part of this RFQ",
    }
  }
  const seenItemIds = new Set(d.lines.map((l) => l.sourcingRequestItemId))

  const quotationId = createId()
  await db.transaction(async (tx) => {
    await tx.insert(supplierQuotations).values({
      id: quotationId,
      rfqId: d.rfqId,
      notes: d.notes,
    })
    for (const line of d.lines) {
      await tx.insert(supplierQuotationLines).values({
        id: createId(),
        quotationId,
        sourcingRequestItemId: line.sourcingRequestItemId,
        itemDescription: line.itemDescription,
        qty: line.qty,
        unitPrice: line.unitPrice,
        currency: line.currency ?? "SAR",
        taxRate: line.taxRate,
        leadTimeDays: line.leadTimeDays,
        availability: line.availability,
        warranty: line.warranty,
        validUntil: line.validUntil,
        offeredPartNumber: line.offeredPartNumber,
        offeredSpec: line.offeredSpec,
        upgradesNote: line.upgradesNote,
        upgradesCost: line.upgradesCost,
      })
    }
    await tx
      .update(supplierRfqs)
      .set({ status: "responded", updatedAt: Date.now() })
      .where(eq(supplierRfqs.id, d.rfqId))

    // Quoted items advance to "quoted" (unless already further along, e.g.
    // selected from an earlier evaluation).
    await tx
      .update(sourcingRequestItems)
      .set({ status: "quoted", updatedAt: Date.now() })
      .where(
        and(
          inArray(sourcingRequestItems.id, [...seenItemIds]),
          inArray(sourcingRequestItems.status, ["pending", "rfq_sent"])
        )
      )

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

// ─── Comparison matrix — item × supplier, tax-normalised (Sourcing V2 P5) ────
// Computed on read (no table). Per request item, lists every quotation line
// that quoted it, with the supplier, a tax-inclusive total, and advisory
// cheapest/fastest badges. Feeds both the comparison UI and the award picker.

export type ComparisonCandidate = {
  quotationLineId: string
  quotationId: string
  supplierId: string | null
  supplierName: string | null
  offeredPartNumber: string | null
  offeredSpec: string | null
  unitPrice: number | null
  currency: string
  taxRate: number | null
  qty: number
  leadTimeDays: number | null
  warranty: string | null
  availability: string | null
  upgradesNote: string | null
  upgradesCost: number | null
  total: number | null
  isCheapest: boolean
  isFastest: boolean
}

export type ComparisonRow = {
  item: {
    id: string
    quantity: number
    customerDescription: string
    supplierDescription: string
    partNumber: string | null
    status: string
  }
  candidates: ComparisonCandidate[]
}

export async function getSourcingComparisonMatrix(sourcingRequestId: string): Promise<ComparisonRow[]> {
  const session = await getStaffSession()
  if (!session) return []

  const items = await db
    .select()
    .from(sourcingRequestItems)
    .where(eq(sourcingRequestItems.sourcingRequestId, sourcingRequestId))
    .orderBy(sourcingRequestItems.createdAt)
  if (items.length === 0) return []

  const rfqs = await db
    .select({ id: supplierRfqs.id, supplierId: supplierRfqs.supplierId, supplierName: suppliers.name })
    .from(supplierRfqs)
    .innerJoin(suppliers, eq(supplierRfqs.supplierId, suppliers.id))
    .where(eq(supplierRfqs.sourcingRequestId, sourcingRequestId))
  if (rfqs.length === 0) return items.map((item) => ({ item, candidates: [] }))

  const quotations = await db
    .select()
    .from(supplierQuotations)
    .where(
      inArray(
        supplierQuotations.rfqId,
        rfqs.map((r) => r.id)
      )
    )
  const quotationById = new Map(quotations.map((q) => [q.id, q]))
  const rfqById = new Map(rfqs.map((r) => [r.id, r]))

  const lines = quotations.length
    ? await db
        .select()
        .from(supplierQuotationLines)
        .where(
          inArray(
            supplierQuotationLines.quotationId,
            quotations.map((q) => q.id)
          )
        )
    : []

  return items.map((item) => {
    const itemLines = lines.filter((l) => l.sourcingRequestItemId === item.id)
    const comparison: ComparisonLine[] = itemLines.map((l) => ({
      quotationLineId: l.id,
      currency: l.currency ?? "SAR",
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      qty: l.qty,
      upgradesCost: l.upgradesCost,
      leadTimeDays: l.leadTimeDays,
    }))
    const badges = computeBadges(comparison)

    const candidates: ComparisonCandidate[] = itemLines.map((l) => {
      const quotation = quotationById.get(l.quotationId)
      const rfq = quotation ? rfqById.get(quotation.rfqId) : undefined
      const total = lineTotal({
        quotationLineId: l.id,
        currency: l.currency ?? "SAR",
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        qty: l.qty,
        upgradesCost: l.upgradesCost,
        leadTimeDays: l.leadTimeDays,
      })
      return {
        quotationLineId: l.id,
        quotationId: l.quotationId,
        supplierId: rfq?.supplierId ?? null,
        supplierName: rfq?.supplierName ?? null,
        offeredPartNumber: l.offeredPartNumber,
        offeredSpec: l.offeredSpec,
        unitPrice: l.unitPrice,
        currency: l.currency ?? "SAR",
        taxRate: l.taxRate,
        qty: l.qty,
        leadTimeDays: l.leadTimeDays,
        warranty: l.warranty,
        availability: l.availability,
        upgradesNote: l.upgradesNote,
        upgradesCost: l.upgradesCost,
        total: total == null ? null : Math.round(total * 100) / 100,
        isCheapest: badges.cheapestLineId === l.id,
        isFastest: badges.fastestLineId === l.id,
      }
    })

    return {
      item: {
        id: item.id,
        quantity: item.quantity,
        customerDescription: item.customerDescription,
        supplierDescription: item.supplierDescription,
        partNumber: item.partNumber,
        status: item.status,
      },
      candidates,
    }
  })
}
