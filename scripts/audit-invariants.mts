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
import { findAssetKindLineTypeMismatches } from "../lib/db/invariants"

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

if (violations > 0) {
  console.error(`\n${violations} invariant violation(s).`)
  process.exit(1)
}
console.log("\nAll invariants hold.")
