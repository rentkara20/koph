/**
 * Aligns order 10693's line quantities with what was actually handed over.
 *
 * The order was written as 38 iPad 10th Gen + 62 iPad A16, but the customer was
 * given equivalent substitutes at handover, so the real mix is 33 + 67. The
 * total (100) is unchanged — only the split moves. Approved by the operator on
 * 2026-08-24.
 *
 * Both lines carry no pricing (no rental months, no unit price, no line total),
 * so this has no commercial effect. The script refuses to run if that ever stops
 * being true, rather than silently leaving a line total that contradicts its own
 * quantity.
 *
 * Run: npx tsx scripts/fix-10693-line-quantities-20260824.mts [--apply]
 */
import { config } from "dotenv"
config({ path: ".env.production.backup", quiet: true })

const APPLY = process.argv.includes("--apply")

const { db } = await import("../lib/db")
const { orderLines, orderUnits } = await import("../lib/db/schema")
const { eq, sql } = await import("drizzle-orm")

const ORDER_ID = "ew2nase5ix819qec2urauevz"
const TARGETS = [
  { id: "l0nhabo11fvhuorz2zkx7nam", label: "iPad 10th Gen 64GB", from: 38, to: 33 },
  { id: "rs4zcdihspk66cp46163uhbq", label: "iPad A16 128GB", from: 62, to: 67 },
]

for (const t of TARGETS) {
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, t.id))
  if (!line) throw new Error(`line ${t.id} not found`)
  if (line.orderId !== ORDER_ID) throw new Error(`line ${t.id} is not on order 10693`)
  if (line.quantity !== t.from) throw new Error(`${t.label}: expected quantity ${t.from}, found ${line.quantity} — refusing`)
  if (line.unitPriceMonthly != null || line.lineTotal != null || line.rentalMonths != null) {
    throw new Error(`${t.label} now carries pricing — recompute the line total instead of only the quantity`)
  }

  const [actual] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orderUnits)
    .where(sql`coalesce(${orderUnits.currentOrderLineId}, ${orderUnits.orderLineId}) = ${t.id}`)
  const devices = Number(actual?.n ?? 0)
  if (devices !== t.to) throw new Error(`${t.label}: ${devices} devices on the line but target quantity is ${t.to} — refusing to guess`)

  console.log(`${t.label}: quantity ${t.from} -> ${t.to} (matches ${devices} devices on the line)`)
}

const total = TARGETS.reduce((s, t) => s + t.to, 0)
console.log(`total across both lines: ${total} (was ${TARGETS.reduce((s, t) => s + t.from, 0)})`)
if (total !== 100) throw new Error(`total changed to ${total} — the order is 100 devices; refusing`)

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write")
  process.exit(0)
}

await db.transaction(async (tx) => {
  for (const t of TARGETS) {
    await tx.update(orderLines).set({ quantity: t.to, updatedAt: Date.now() }).where(eq(orderLines.id, t.id))
  }
})

const after = await db
  .select({ description: orderLines.description, quantity: orderLines.quantity })
  .from(orderLines)
  .where(eq(orderLines.orderId, ORDER_ID))
console.table(after)
