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
  // ── Asset module (order_unit → full asset entity) ─────────────────────────
  `ALTER TABLE order_unit ADD COLUMN purchase_date integer`,
  `ALTER TABLE order_unit ADD COLUMN warranty_end integer`,
  `ALTER TABLE order_unit ADD COLUMN asset_tag text`,
  `ALTER TABLE order_unit ADD COLUMN location text NOT NULL DEFAULT 'main_warehouse'`,
  `ALTER TABLE order_unit ADD COLUMN current_request_id text`,
  `ALTER TABLE order_unit ADD COLUMN current_customer_id text`,
  `ALTER TABLE order_unit ADD COLUMN retired_at integer`,
  `ALTER TABLE order_unit ADD COLUMN retirement_reason text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS order_unit_asset_tag_idx ON order_unit (asset_tag)`,
  `CREATE TABLE IF NOT EXISTS asset_event (
    id text PRIMARY KEY,
    asset_id text NOT NULL REFERENCES order_unit(id) ON DELETE CASCADE,
    type text NOT NULL,
    from_status text,
    to_status text,
    request_id text,
    customer_id text,
    notes text,
    by_user_id text,
    created_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS asset_event_asset_idx ON asset_event (asset_id, created_at)`,
  // ── Maintenance orders + customer portal ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS maintenance_order (
    id text PRIMARY KEY,
    asset_id text NOT NULL REFERENCES order_unit(id) ON DELETE CASCADE,
    issue text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    cost real,
    vendor_notes text,
    opened_by text,
    opened_at integer NOT NULL,
    closed_at integer
  )`,
  `CREATE INDEX IF NOT EXISTS maintenance_order_asset_idx ON maintenance_order (asset_id)`,
  `CREATE INDEX IF NOT EXISTS maintenance_order_status_idx ON maintenance_order (status)`,
  `CREATE TABLE IF NOT EXISTS customer_portal_token (
    id text PRIMARY KEY,
    customer_id text NOT NULL UNIQUE REFERENCES customer(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    created_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customer_callback_request (
    id text PRIMARY KEY,
    customer_id text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    request_id text,
    kind text NOT NULL,
    message text,
    resolved_at integer,
    created_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS customer_callback_customer_idx ON customer_callback_request (customer_id)`,
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
