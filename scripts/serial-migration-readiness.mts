/**
 * Serial uniqueness migration-readiness report — READ-ONLY.
 * Run against the target database before migration 0024. It reports serials
 * that collide after the canonical trim + case-insensitive normalization.
 */
import { createClient } from "@libsql/client"

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db"
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

const result = await client.execute(`
  select
    lower(trim(serial_number)) as canonical_serial,
    count(*) as duplicate_count,
    group_concat(id, ', ') as asset_ids,
    group_concat(serial_number, ' | ') as stored_values
  from order_unit
  where serial_number is not null and trim(serial_number) <> ''
  group by lower(trim(serial_number))
  having count(*) > 1
  order by duplicate_count desc, canonical_serial asc
`)

console.log("# Serial Migration-Readiness Report")
console.log(`# DB: ${url.startsWith("file:") ? url : "remote (Turso)"}`)
console.log(`# Generated: ${new Date().toISOString()}`)
console.log("# Mode: READ-ONLY — no rows were written or modified.\n")

if (result.rows.length === 0) {
  console.log("No duplicate serials found. Migration 0024 is ready to apply.")
} else {
  console.log(`${result.rows.length} canonical serial(s) require review before migration 0024:\n`)
  for (const row of result.rows) {
    console.log(`- ${row.canonical_serial} (${row.duplicate_count} rows)`)
    console.log(`  stored: ${row.stored_values}`)
    console.log(`  asset ids: ${row.asset_ids}`)
  }
  process.exitCode = 1
}

client.close()
