import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { getSessionWithRole } from "@/lib/auth/session"

// Admin-only, idempotent schema migration for production. Unlike the old open
// GET /api/migrate* routes (deleted), this requires an authenticated admin and
// only runs additive, IF-NOT-EXISTS DDL. Trigger once after a deploy that adds
// schema, e.g. from the browser console while logged in as admin:
//   fetch("/api/admin/migrate", { method: "POST" }).then(r => r.json()).then(console.log)
const STATEMENTS: string[] = [
  `ALTER TABLE payment_batch ADD COLUMN statement_token text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_batch_statement_token_idx ON payment_batch (statement_token)`,
  `CREATE INDEX IF NOT EXISTS partner_task_request_idx ON partner_task (request_id)`,
  `CREATE INDEX IF NOT EXISTS partner_task_partner_status_idx ON partner_task (partner_id, status)`,
  `CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS signature_request_request_idx ON signature_request (request_id)`,
  `CREATE INDEX IF NOT EXISTS partner_payment_partner_status_idx ON partner_payment (partner_id, status)`,
  `CREATE INDEX IF NOT EXISTS partner_payment_batch_idx ON partner_payment (batch_id)`,
  `CREATE INDEX IF NOT EXISTS request_customer_idx ON request (customer_id)`,
  `CREATE INDEX IF NOT EXISTS request_status_idx ON request (status)`,
  `CREATE INDEX IF NOT EXISTS customer_contact_customer_idx ON customer_contact (customer_id)`,
]

export async function POST(): Promise<Response> {
  const session = await getSessionWithRole("admin")
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 })

  const results: { statement: string; ok: boolean; note?: string }[] = []
  for (const stmt of STATEMENTS) {
    try {
      await db.run(sql.raw(stmt))
      results.push({ statement: stmt.slice(0, 60), ok: true })
    } catch (e) {
      // "duplicate column" on the ALTER is expected on re-run — treat as ok
      const msg = (e as Error).message
      const benign = /duplicate column|already exists/i.test(msg)
      results.push({ statement: stmt.slice(0, 60), ok: benign, note: msg })
    }
  }

  return Response.json({ ran: results })
}
