// One-off (2026-08-16): generate the 2026-07 payment batches for the three
// deliveries closed by close-july-deliveries-20260816.mts.
//
// Mirrors generateBatch (lib/actions/payments.ts) exactly — same period filter,
// same open-batch guard, same batched/statement-token writes — minus the
// session/revalidate shell, which cannot run outside a request context.
// Batches are created as "draft": nothing is paid until an admin approves them.
//
// Usage:
//   npx tsx scripts/generate-july-batches-20260816.mts
//   npx tsx scripts/generate-july-batches-20260816.mts --apply

import { config } from "dotenv"
config({ path: ".env.production.backup" })

const rawUrl = process.env.TURSO_DATABASE_URL?.replace(/"/g, "")
const rawToken = process.env.TURSO_AUTH_TOKEN?.replace(/"/g, "")
if (!rawUrl || !rawToken) throw new Error("missing prod creds")
if (!rawUrl.startsWith("libsql://")) throw new Error(`refusing to run against non-Turso url: ${rawUrl}`)
process.env.TURSO_DATABASE_URL = rawUrl
process.env.TURSO_AUTH_TOKEN = rawToken

const { db } = await import("@/lib/db")
const { partnerPayments, paymentBatches, partners, activityLogs } = await import("@/lib/db/schema")
const { createId } = await import("@/lib/utils/ids")
const { and, eq, inArray, notInArray, sql } = await import("drizzle-orm")
const crypto = await import("node:crypto")

const APPLY = process.argv.includes("--apply")
const ACTOR = "kb0Sn8iriF6VMKo39rpYEHog5ojawlfh"
const PERIOD = "2026-07"
const OFFSET = "+3 hours" // Asia/Riyadh — matches getBusinessMonthOffsetModifier default

const periodExpr = sql`strftime('%Y-%m', datetime(${partnerPayments.createdAt}/1000, 'unixepoch', ${OFFSET}))`

const pending = await db
  .select({
    id: partnerPayments.id,
    partnerId: partnerPayments.partnerId,
    partnerName: partners.name,
    totalAmount: partnerPayments.totalAmount,
  })
  .from(partnerPayments)
  .innerJoin(partners, eq(partners.id, partnerPayments.partnerId))
  .where(and(eq(partnerPayments.status, "pending"), eq(periodExpr, PERIOD)))

if (pending.length === 0) {
  console.log(`No pending payments in ${PERIOD}.`)
  process.exit(0)
}

const byPartner = new Map<string, typeof pending>()
for (const p of pending) {
  const list = byPartner.get(p.partnerId) ?? []
  list.push(p)
  byPartner.set(p.partnerId, list)
}

for (const [partnerId, payments] of byPartner) {
  const name = payments[0].partnerName
  const total = payments.reduce((s, p) => s + p.totalAmount, 0)
  console.log(`\n=== ${name} — ${PERIOD} ===`)
  console.log(`  ${payments.length} payment(s), ${total} SAR → new draft batch`)

  const [openBatch] = await db
    .select()
    .from(paymentBatches)
    .where(
      and(
        eq(paymentBatches.partnerId, partnerId),
        eq(paymentBatches.period, PERIOD),
        notInArray(paymentBatches.status, ["paid"])
      )
    )
  if (openBatch) {
    console.log(`  ✗ an open batch already exists (${openBatch.id}, ${openBatch.status}) — skipping`)
    continue
  }

  if (!APPLY) continue

  const batchId = createId()
  await db.transaction(async (tx) => {
    await tx.insert(paymentBatches).values({
      id: batchId,
      partnerId,
      period: PERIOD,
      totalAmount: total,
      status: "draft",
      statementToken: crypto.randomBytes(32).toString("hex"),
    })
    await tx
      .update(partnerPayments)
      .set({ batchId, status: "batched", updatedAt: Date.now() })
      .where(inArray(partnerPayments.id, payments.map((p) => p.id)))
    await tx.insert(activityLogs).values({
      id: createId(),
      entityType: "payment_batch",
      entityId: batchId,
      action: "batch_generated",
      i18nKey: "activity.batchGenerated",
      i18nData: JSON.stringify({ count: payments.length, total, period: PERIOD }),
      performedBy: ACTOR,
      performedAs: "user",
      createdAt: Date.now(),
    })
  })
  console.log(`  ✓ batch ${batchId} created (draft)`)
}

console.log(APPLY ? "\n✓ Done." : "\nDry run — no writes. Re-run with --apply to commit.")
