import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, orderLines, orders } from "@/lib/db/schema"
import { createOrderCore, updateOrderCore } from "@/lib/actions/orders"
import { createOrderSchema, updateOrderSchema } from "@/lib/validation/schemas"
import type { z } from "zod"
import type { ColumnDef, ImportRow } from "./types"

type Database = typeof db

// Practical subset of the order header. Line items are out of scope for CSV
// import (an order's lines are commercial quote detail entered through the
// order form) — import only creates/updates the header. `status` is
// intentionally omitted: it is derived from unit fulfillment
// (deriveOrderStatus), not settable directly, even in the existing edit form.
export const ORDER_COLUMNS: ColumnDef[] = [
  { header: "orderNumber", field: "orderNumber", required: true },
  { header: "customerId", field: "customerId", required: false },
  { header: "customerName", field: "customerName", required: false },
  { header: "contactPerson", field: "contactPerson", required: false },
  { header: "contactMobile", field: "contactMobile", required: false },
  { header: "contactEmail", field: "contactEmail", required: false },
  { header: "rentalPeriodMonths", field: "rentalPeriodMonths", required: false },
  { header: "additionalPeriodMonths", field: "additionalPeriodMonths", required: false },
  { header: "notes", field: "notes", required: false },
]

export async function exportOrderRows(): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      customerName: customers.name,
      contactPerson: orders.contactPerson,
      contactMobile: orders.contactMobile,
      contactEmail: orders.contactEmail,
      rentalPeriodMonths: orders.rentalPeriodMonths,
      additionalPeriodMonths: orders.additionalPeriodMonths,
      notes: orders.notes,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(isNull(orders.deletedAt))
  return rows
}

function parseInt10(value: string, field: string): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isInteger(n)) throw new Error(`Invalid ${field}: "${value}" (expected a whole number)`)
  return n
}

export async function validateOrderRows(
  database: Database,
  rows: Record<string, string>[]
): Promise<ImportRow[]> {
  const existingOrders = await database
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(isNull(orders.deletedAt))
  const byOrderNumber = new Map(existingOrders.map((o) => [o.orderNumber, o.id]))

  const seenOrderNumbers = new Set<string>()
  const results: ImportRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 2
    try {
      const orderNumber = raw.orderNumber?.trim()
      if (!orderNumber) throw new Error("orderNumber is required")
      if (seenOrderNumbers.has(orderNumber)) throw new Error(`Duplicate orderNumber in file: ${orderNumber}`)
      seenOrderNumbers.add(orderNumber)

      const customerIdRaw = raw.customerId?.trim()
      const customerNameRaw = raw.customerName?.trim()
      let customerId = customerIdRaw

      if (!customerId && customerNameRaw) {
        const matches = await database
          .select({ id: customers.id })
          .from(customers)
          .where(and(isNull(customers.deletedAt), eq(customers.name, customerNameRaw)))
        if (matches.length === 0) throw new Error(`No customer found named "${customerNameRaw}"`)
        if (matches.length > 1) throw new Error(`Multiple customers named "${customerNameRaw}" — use customerId instead`)
        customerId = matches[0].id
      }
      if (!customerId) throw new Error("customerId or customerName is required")
      const [customer] = await database.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId))
      if (!customer) throw new Error(`No customer with id "${customerId}"`)

      const header = {
        orderNumber,
        customerId,
        contactPerson: raw.contactPerson?.trim() || undefined,
        contactMobile: raw.contactMobile?.trim() || undefined,
        contactEmail: raw.contactEmail?.trim() || undefined,
        rentalPeriodMonths: parseInt10(raw.rentalPeriodMonths?.trim() ?? "", "rentalPeriodMonths"),
        additionalPeriodMonths: parseInt10(raw.additionalPeriodMonths?.trim() ?? "", "additionalPeriodMonths"),
        notes: raw.notes?.trim() || undefined,
      }

      const matchedId = byOrderNumber.get(orderNumber)

      if (matchedId) {
        // Preserve existing lines exactly — CSV import never touches line
        // items, so every current line is resubmitted unchanged (the "kept"
        // branch of updateOrderCore's reconcile, no delete/insert).
        const existingLines = await database
          .select()
          .from(orderLines)
          .where(eq(orderLines.orderId, matchedId))
        const linesInput = existingLines.map((l) => ({
          id: l.id,
          type: l.type,
          description: l.description,
          brand: l.brand ?? undefined,
          model: l.model ?? undefined,
          quantity: l.quantity,
          rentalMonths: l.rentalMonths ?? undefined,
          unitPriceMonthly: l.unitPriceMonthly ?? undefined,
          notes: l.notes ?? undefined,
        }))
        const parsed = updateOrderSchema.safeParse({ ...header, lines: linesInput })
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid order row")

        results.push({
          rowNumber,
          raw,
          classification: "update",
          matchedId,
          input: parsed.data as unknown as Record<string, unknown>,
        })
      } else {
        const parsed = createOrderSchema.safeParse({ ...header, lines: [] })
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid order row")

        results.push({
          rowNumber,
          raw,
          classification: "new",
          input: parsed.data as unknown as Record<string, unknown>,
        })
      }
    } catch (error) {
      results.push({
        rowNumber,
        raw,
        classification: "error",
        error: error instanceof Error ? error.message : "Invalid row",
      })
    }
  }
  return results
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function commitOrderRow(tx: Tx, row: ImportRow, actorUserId: string | null): Promise<void> {
  if (row.classification === "new") {
    await createOrderCore(tx, row.input as z.infer<typeof createOrderSchema>, actorUserId)
  } else if (row.classification === "update" && row.matchedId) {
    await updateOrderCore(tx, row.matchedId, row.input as z.infer<typeof updateOrderSchema>)
  }
}
