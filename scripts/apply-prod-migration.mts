/**
 * Applies pending drizzle migrations to PRODUCTION using .env.production.backup.
 *
 * drizzle.config.ts reads .env.local, so `drizzle-kit migrate` targets local by
 * design. This is the deliberate, explicit path for prod — it prints the
 * watermark before and after, because an out-of-order or silently-skipped
 * migration is how this project has broken production before.
 *
 * Run: npx tsx scripts/apply-prod-migration.mts
 */
import { config } from "dotenv"
config({ path: ".env.production.backup", quiet: true })

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

const url = process.env.TURSO_DATABASE_URL?.replace(/"/g, "")
const authToken = process.env.TURSO_AUTH_TOKEN?.replace(/"/g, "")
if (!url?.startsWith("libsql:")) throw new Error("refusing to run: no remote prod URL resolved")

const client = createClient({ url, authToken })
const before = await client.execute("select count(*) n, max(created_at) latest from __drizzle_migrations")
console.log(`prod: ${url.replace(/\/\/.*@/, "//***@")}`)
console.log(`applied before: ${before.rows[0].n}`)

await migrate(drizzle(client), { migrationsFolder: "./lib/db/migrations" })

const after = await client.execute("select count(*) n from __drizzle_migrations")
console.log(`applied after:  ${after.rows[0].n}`)
const cols = await client.execute("select name from pragma_table_info('order_unit') where name like 'current_%'")
console.log("current_* columns:", cols.rows.map((r) => r.name).join(", "))
