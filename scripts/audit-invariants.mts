// Runs the cross-table invariants in lib/db/invariants.ts against a live DB and
// exits non-zero if any is violated.
//
// The point of this being a one-liner: the defect it catches came from an
// out-of-band repair script writing SQL that no application guard sees. Nothing
// in the codebase can stop that — the only defence is checking afterwards, and
// a check only gets run if running it is trivial.
//
//   npm run audit:invariants                     # whatever .env.local points at
//   npm run audit:invariants -- --prod           # .env.production.backup
//
// Run it after ANY hand-written data correction against production.

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { config } from "dotenv"
import * as schema from "../lib/db/schema"
import {
  findAllocationDrift,
  findAssetKindLineTypeMismatches,
  findClosedTasksWithoutPayment,
  findOriginMismatches,
} from "../lib/db/invariants"

const useProd = process.argv.includes("--prod")
config({ path: useProd ? ".env.production.backup" : ".env.local", quiet: true })

const url = process.env.TURSO_DATABASE_URL?.replace(/"/g, "") || "file:local.db"
const authToken = process.env.TURSO_AUTH_TOKEN?.replace(/"/g, "")

if (useProd && !url.startsWith("libsql:")) {
  console.error("--prod given but no remote TURSO_DATABASE_URL resolved — refusing to audit a local file and report it as production")
  process.exit(2)
}

const db = drizzle(createClient({ url, authToken }), { schema })
console.log(`auditing ${useProd ? "PRODUCTION" : "local"}: ${url.replace(/\/\/.*@/, "//***@")}\n`)

let violations = 0

const kindMismatches = await findAssetKindLineTypeMismatches(db)
if (kindMismatches.length === 0) {
  console.log("✓ order_unit.kind agrees with order_line.type")
} else {
  violations += kindMismatches.length
  console.error(`✗ ${kindMismatches.length} unit(s) whose kind contradicts their order line:`)
  console.table(kindMismatches)
  console.error(
    "  A rental unit stamped 'sale' cannot be collected back from the customer, and\n" +
      "  a sale unit stamped 'rental' re-enters the rental pool. Fix by re-deriving kind\n" +
      "  from the line: sold_product -> sale, rental_asset -> rental.\n"
  )
}

const unpaidClosed = await findClosedTasksWithoutPayment(db)
if (unpaidClosed.length === 0) {
  console.log("✓ every closed partner task has a payment or a deliberate decision")
} else {
  violations += unpaidClosed.length
  console.error(`✗ ${unpaidClosed.length} closed task(s) that owe the partner nothing:`)
  console.table(unpaidClosed)
  console.error(
    "  The trip was done and closed, but no partner_payment row exists and no\n" +
      "  'none'/'hold' decision was recorded — so the partner is silently never paid.\n" +
      "  Usual cause: no partner contract to price against at sign-off time. Fix by\n" +
      "  adding the contract and re-running the payment decision for these tasks.\n"
  )
}

const allocationDrift = await findAllocationDrift(db)
if (allocationDrift.length === 0) {
  console.log("✓ every asset's current allocation is complete or absent")
} else {
  violations += allocationDrift.length
  console.error(`✗ ${allocationDrift.length} unit(s) with a half-set allocation:`)
  console.table(allocationDrift)
  console.error(
    "  A device out with a customer must name the order it is serving, and a device\n" +
      "  in stock must name none. A half-set allocation makes the device vanish from\n" +
      "  its order's list or appear on two at once. Fix by re-running the transition\n" +
      "  through applyAssetTransition rather than patching one column.\n"
  )
}

const originMismatches = await findOriginMismatches(db)
if (originMismatches.length === 0) {
  console.log("✓ every asset's origin order matches its origin line")
} else {
  violations += originMismatches.length
  console.error(`✗ ${originMismatches.length} unit(s) whose origin order and line disagree:`)
  console.table(originMismatches)
  console.error(
    "  order_id and order_line_id record where the device ENTERED the fleet and must\n" +
      "  never be rewritten — lending a device out is recorded in current_order_id.\n" +
      "  A mismatch here means something rewrote the origin, which erases the\n" +
      "  originating order's record of the device.\n"
  )
}

if (violations > 0) {
  console.error(`\n${violations} invariant violation(s).`)
  process.exit(1)
}
console.log("\nAll invariants hold.")
