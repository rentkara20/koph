// One-off production correction (2026-08-16).
//
// KR-2026-00013 / 00020 / 00024 were physically delivered in July but their
// partner tasks were never closed, so the units are stuck at "assigned" and no
// partner payment exists. Closing them through the admin UI today would stamp
// delivered_at / completed_at / closed_at / partner_payment.created_at with
// today's date, pushing July work into the August payment batch
// (generateBatch filters on strftime('%Y-%m', partner_payment.created_at)).
//
// This script performs the same writes signOffTask would (decision = "full"),
// but stamps the real July delivery moment instead of Date.now(). It reuses the
// actual business logic for everything that has rules —
//   applyAssetTransition  (the asset chokepoint: legality, concurrency, events)
//   computePayment        (pricing)
//   deriveRequestStatus   (request state machine)
// — and only reimplements the session/revalidate shell, which cannot run
// outside a request context.
//
// Audit trail (activity_log, domain_event) is deliberately stamped NOW: the
// data entry genuinely happened today, and backdating it would erase the record
// of this correction. Only operational timestamps are moved.
//
// Usage:
//   node --experimental-strip-types scripts/close-july-deliveries-20260816.mts
//   node --experimental-strip-types scripts/close-july-deliveries-20260816.mts --apply
//
// Take a backup first: node scripts/backup-prod.mjs backups/<name>.sql

import { config } from "dotenv"
config({ path: ".env.production.backup" })

const rawUrl = process.env.TURSO_DATABASE_URL?.replace(/"/g, "")
const rawToken = process.env.TURSO_AUTH_TOKEN?.replace(/"/g, "")
if (!rawUrl || !rawToken) throw new Error("missing prod creds")
if (!rawUrl.startsWith("libsql://")) throw new Error(`refusing to run against non-Turso url: ${rawUrl}`)
// lib/db reads these at import time — set them before importing it.
process.env.TURSO_DATABASE_URL = rawUrl
process.env.TURSO_AUTH_TOKEN = rawToken

const { db } = await import("@/lib/db")
const {
  partnerTasks,
  partnerPayments,
  partnerPaymentDecisions,
  partnerContracts,
  requests,
  requestItems,
  orderUnits,
  assetEvents,
  activityLogs,
} = await import("@/lib/db/schema")
const { applyAssetTransition, AssetTransitionError } = await import("@/lib/actions/asset-transition")
const { computePayment } = await import("@/lib/domain/pricing")
const { deriveRequestStatus } = await import("@/lib/domain/request-status")
const { createId } = await import("@/lib/utils/ids")
const { and, eq, inArray, isNotNull, gte } = await import("drizzle-orm")

const APPLY = process.argv.includes("--apply")
const ACTOR = "kb0Sn8iriF6VMKo39rpYEHog5ojawlfh" // Abdelrahman Ali (admin)
const RUN_START = Date.now()
const riyadh = (ts: number | null) =>
  ts ? new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "—"

type Target = {
  requestNumber: string
  requestId: string
  taskId: string
  /** Real delivery moment (Riyadh). Must be >= the task's accepted_at. */
  deliveredAt: number
  /** Set only where the stored delivery_date is provably wrong. */
  fixDeliveryDate?: number
}

const TARGETS: Target[] = [
  {
    // Accepted 13/07 16:29 Riyadh. No customer signature on record.
    requestNumber: "KR-2026-00013",
    requestId: "fomv6cfmnqv4vebz4585r20v",
    taskId: "kodewfn220u3kn27fz3f5e2q",
    deliveredAt: new Date("2026-07-13T18:00:00+03:00").getTime(),
  },
  {
    // Exact customer-signature timestamp — hard evidence of handover.
    requestNumber: "KR-2026-00020",
    requestId: "useyv4kryi1mrymclfpch3am",
    taskId: "bl6zhnazxn1v5gj8n85t4tca",
    deliveredAt: 1784715270470,
  },
  {
    // Stored delivery_date was 16/07 — nine days before the task was created
    // (25/07). Accepted 26/07 09:52 Riyadh, so delivery can only be 26/07.
    requestNumber: "KR-2026-00024",
    requestId: "xpsd275hfmezq4nteeuj3w4s",
    taskId: "jx3ni38gfzboc79xa96nrd3i",
    deliveredAt: new Date("2026-07-26T12:00:00+03:00").getTime(),
    fixDeliveryDate: new Date("2026-07-26T00:00:00+03:00").getTime(),
  },
]

let failed = false

for (const t of TARGETS) {
  console.log(`\n=== ${t.requestNumber} → delivered ${riyadh(t.deliveredAt)} ===`)

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, t.taskId))
  const [req] = await db.select().from(requests).where(eq(requests.id, t.requestId))
  if (!task || !req) {
    console.log("  ✗ task or request not found")
    failed = true
    continue
  }
  if (task.status !== "in_progress") {
    console.log(`  ✗ task status is "${task.status}", expected "in_progress" — already handled?`)
    failed = true
    continue
  }
  if (task.requestId !== t.requestId) {
    console.log("  ✗ task is not linked to the expected request")
    failed = true
    continue
  }
  if (task.acceptedAt && task.acceptedAt > t.deliveredAt) {
    console.log(`  ✗ target precedes accepted_at (${riyadh(task.acceptedAt)}) — would invert the timeline`)
    failed = true
    continue
  }
  const existing = await db.select().from(partnerPayments).where(eq(partnerPayments.partnerTaskId, t.taskId))
  if (existing.length > 0) {
    console.log("  ✗ a partner_payment already exists for this task")
    failed = true
    continue
  }

  const [contract] = task.contractId
    ? await db.select().from(partnerContracts).where(eq(partnerContracts.id, task.contractId))
    : []
  if (!contract) {
    console.log("  ✗ no contract on this task — cannot price the payment")
    failed = true
    continue
  }
  const { quantity, totalAmount } = computePayment(contract.pricingModel, contract.unitPrice, undefined)

  const units = await db
    .select({ id: orderUnits.id, status: orderUnits.status, kind: orderUnits.kind, serial: orderUnits.serialNumber })
    .from(requestItems)
    .innerJoin(orderUnits, eq(orderUnits.id, requestItems.orderUnitId))
    .where(and(eq(requestItems.requestId, t.requestId), isNotNull(requestItems.orderUnitId)))

  const nextRequestStatus = deriveRequestStatus(req.status, ["closed"])

  console.log(`  task     ${task.status} → closed, delivered/completed/closed_at = ${riyadh(t.deliveredAt)}`)
  console.log(`  payment  ${totalAmount} SAR (${contract.pricingModel} × ${quantity}), period ${new Date(t.deliveredAt).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }).slice(0, 7)}`)
  console.log(`  request  ${req.status} → ${nextRequestStatus ?? "(unchanged)"}`)
  if (t.fixDeliveryDate) {
    console.log(`  delivery_date  ${riyadh(req.deliveryDate)} → ${riyadh(t.fixDeliveryDate)}`)
  }
  for (const u of units) {
    const target = u.kind === "sale" ? "delivered → sold" : "delivered"
    console.log(`  unit     ${u.serial} (${u.kind}) ${u.status} → ${target}`)
  }

  if (!APPLY) continue

  const skipped: string[] = []
  await db.transaction(async (tx) => {
    await tx
      .update(partnerTasks)
      .set({
        status: "closed",
        deliveredAt: t.deliveredAt,
        completedAt: t.deliveredAt,
        closedAt: t.deliveredAt,
        closedBy: ACTOR,
        updatedAt: Date.now(),
      })
      .where(and(eq(partnerTasks.id, t.taskId), eq(partnerTasks.status, "in_progress")))

    await tx.insert(partnerPaymentDecisions).values({
      id: createId(),
      partnerTaskId: t.taskId,
      decision: "full",
      approvedAmount: totalAmount,
      reason: null,
      decidedBy: ACTOR,
      decidedAt: t.deliveredAt,
      updatedAt: t.deliveredAt,
    })

    await tx.insert(partnerPayments).values({
      id: createId(),
      partnerId: task.partnerId,
      partnerTaskId: t.taskId,
      pricingModel: contract.pricingModel,
      quantity,
      unitPrice: contract.unitPrice,
      totalAmount,
      status: "pending",
      createdAt: t.deliveredAt,
    })

    for (const u of units) {
      try {
        await applyAssetTransition(tx, u.id, "deliver", {
          requestId: t.requestId,
          customerId: req.customerId,
          byUserId: ACTOR,
        })
        if (u.kind === "sale") {
          await applyAssetTransition(tx, u.id, "sell", {
            requestId: t.requestId,
            customerId: req.customerId,
            byUserId: ACTOR,
          })
        }
      } catch (error) {
        if (!(error instanceof AssetTransitionError)) throw error
        skipped.push(`${u.serial}: ${error.code}`)
      }
    }

    // applyAssetTransition stamps asset_event.created_at with Date.now(). The
    // movement happened in July — move the rows this run just wrote (and only
    // those: bounded by RUN_START and by this request's units).
    if (units.length > 0) {
      await tx
        .update(assetEvents)
        .set({ createdAt: t.deliveredAt })
        .where(
          and(
            inArray(assetEvents.assetId, units.map((u) => u.id)),
            gte(assetEvents.createdAt, RUN_START)
          )
        )
    }

    if (nextRequestStatus) {
      await tx
        .update(requests)
        .set({ status: nextRequestStatus, updatedAt: Date.now() })
        .where(and(eq(requests.id, t.requestId), eq(requests.status, req.status)))
    }
    if (t.fixDeliveryDate) {
      await tx.update(requests).set({ deliveryDate: t.fixDeliveryDate }).where(eq(requests.id, t.requestId))
    }

    // Audit trail stamped NOW — this correction happened today.
    await tx.insert(activityLogs).values({
      id: createId(),
      entityType: "partner_task",
      entityId: t.taskId,
      action: "task_signed_off",
      i18nKey: "activity.taskSignedOff",
      performedBy: ACTOR,
      performedAs: "user",
      createdAt: Date.now(),
    })
  })

  console.log("  ✓ applied" + (skipped.length ? `  (skipped assets: ${skipped.join(", ")})` : ""))
}

if (failed) {
  console.log("\n✗ Preconditions failed. Nothing was written for those targets.")
  process.exit(1)
}
console.log(APPLY ? "\n✓ Done." : "\nDry run — no writes. Re-run with --apply to commit.")
