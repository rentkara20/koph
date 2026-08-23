/**
 * Records the deliveries that already happened on order 10693 (JeelPay) but were
 * never closed in KOPH.
 *
 * Confirmed by the operator on 2026-08-24: every device on this order reached the
 * customer and was received.
 *
 *   KR-2026-00030 (part 1, 54 devices) — delivery date 2026-07-29, no partner
 *     task was ever created, the delivery note was opened but never signed.
 *   KR-2026-00038 (part 3, 16 devices) — delivery date 2026-08-03, signed by
 *     محمد جمال on 2026-08-03, yet the request stayed "draft" and its devices
 *     stayed "assigned".
 *
 * Both requests are stuck at "draft" with their devices at "assigned", so the
 * system reports them as never delivered. deriveRequestStatus returns null for a
 * request with no partner tasks, so setting the status here is stable — nothing
 * recomputes it back.
 *
 * Every asset moves through applyAssetTransition (the OI-1 chokepoint), so each
 * one gets its asset_event and domain event exactly as a normal sign-off would.
 * Nothing is deleted, no origin is touched, and units already "delivered" are
 * skipped rather than transitioned twice.
 *
 * Run: npx tsx scripts/close-10693-deliveries-20260824.mts [--apply]
 */
import { config } from "dotenv"
config({ path: ".env.production.backup", quiet: true })

const APPLY = process.argv.includes("--apply")

const { db } = await import("../lib/db")
const { requests, requestItems, orderUnits } = await import("../lib/db/schema")
const { applyAssetTransition } = await import("../lib/actions/asset-transition")
const { eq, inArray } = await import("drizzle-orm")

const TARGETS = [
  {
    number: "KR-2026-00030",
    expected: 54,
    note: "Handed over at the KARA office on 2026-07-29 — the customer collected in person, so no partner trip and no signature was captured. Closed retroactively on 2026-08-24 on the operator's confirmation. The signature request is still open: the signed paper note can be uploaded against it later.",
  },
  {
    number: "KR-2026-00038",
    expected: 16,
    note: "Handed over at the KARA office on 2026-08-03 and signed by the receiver (محمد جمال). Closed retroactively on 2026-08-24 — the request had stayed in draft because a request with no partner task can never leave draft.",
  },
  {
    number: "KR-2026-00055",
    expected: 20,
    note: "Handed over to the customer. Closed on 2026-08-24 on the operator's confirmation. Its partner task is left untouched: whether a partner is owed for this trip is a money decision for ops, not this correction.",
  },
]

for (const target of TARGETS) {
  const [req] = await db.select().from(requests).where(eq(requests.requestNumber, target.number))
  if (!req) throw new Error(`${target.number} not found`)
  if (req.deletedAt) throw new Error(`${target.number} is deleted — refusing`)
  if (req.quoteNumber !== "10693") throw new Error(`${target.number} belongs to order ${req.quoteNumber}, not 10693`)
  if (req.status === "completed") {
    console.log(`\n${target.number} | already completed — skipping`)
    continue
  }

  const items = await db
    .select({ orderUnitId: requestItems.orderUnitId })
    .from(requestItems)
    .where(eq(requestItems.requestId, req.id))
  const unitIds = items.map((i) => i.orderUnitId).filter((v): v is string => Boolean(v))
  if (unitIds.length !== target.expected) {
    throw new Error(`${target.number}: expected ${target.expected} linked devices, found ${unitIds.length} — refusing to guess`)
  }

  const units = await db
    .select({ id: orderUnits.id, serialNumber: orderUnits.serialNumber, status: orderUnits.status })
    .from(orderUnits)
    .where(inArray(orderUnits.id, unitIds))

  const toDeliver = units.filter((u) => u.status === "assigned")
  const already = units.filter((u) => u.status === "delivered")
  const unexpected = units.filter((u) => !["assigned", "delivered"].includes(u.status))
  if (unexpected.length) {
    throw new Error(
      `${target.number}: ${unexpected.length} device(s) in an unexpected state (${unexpected.map((u) => `${u.serialNumber}:${u.status}`).join(", ")}) — refusing`,
    )
  }

  console.log(`\n${target.number} | request status "${req.status}" -> "completed"`)
  console.log(`  devices: ${toDeliver.length} assigned -> delivered, ${already.length} already delivered`)

  if (!APPLY) continue

  await db.transaction(async (tx) => {
    for (const u of toDeliver) {
      await applyAssetTransition(tx, u.id, "deliver", { notes: target.note })
    }
    await tx
      .update(requests)
      .set({ status: "completed", updatedAt: Date.now() })
      .where(eq(requests.id, req.id))
  })
  console.log(`  done`)
}

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write")
  process.exit(0)
}

const after = await db
  .select({ number: requests.requestNumber, status: requests.status })
  .from(requests)
  .where(inArray(requests.requestNumber, TARGETS.map((t) => t.number)))
console.table(after)
