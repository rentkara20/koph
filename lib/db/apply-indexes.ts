// One-off: apply secondary indexes to the DB pointed at by .env.local.
// Run: npx tsx lib/db/apply-indexes.ts
// For production, run again with .env pointing at the prod Turso DB.
import { config } from "dotenv"
config({ path: ".env.local" })

import { createClient } from "@libsql/client"

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS partner_task_request_idx ON partner_task (request_id)`,
  `CREATE INDEX IF NOT EXISTS partner_task_partner_status_idx ON partner_task (partner_id, status)`,
  `CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS signature_request_request_idx ON signature_request (request_id)`,
  `CREATE INDEX IF NOT EXISTS partner_payment_partner_status_idx ON partner_payment (partner_id, status)`,
  `CREATE INDEX IF NOT EXISTS partner_payment_batch_idx ON partner_payment (batch_id)`,
]

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error("TURSO_DATABASE_URL missing")
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  for (const stmt of INDEXES) {
    await client.execute(stmt)
    console.log("ok:", stmt.split(" ")[5])
  }
  client.close()
}

main()
