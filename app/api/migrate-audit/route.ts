import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// Migration: adds audit fields to signature_request and customer_signature tables
// Visit /api/migrate-audit once after deploy, then this route can be deleted

const migrations = [
  `ALTER TABLE signature_request ADD COLUMN verification_id TEXT UNIQUE`,
  `ALTER TABLE customer_signature ADD COLUMN signed_at_tz TEXT NOT NULL DEFAULT 'Asia/Riyadh'`,
  `ALTER TABLE customer_signature ADD COLUMN user_agent TEXT`,
  `ALTER TABLE customer_signature ADD COLUMN audit_data_hash TEXT`,
]

export async function GET() {
  const results: { sql: string; status: string }[] = []

  for (const statement of migrations) {
    try {
      await db.run(sql.raw(statement))
      results.push({ sql: statement, status: "applied" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        results.push({ sql: statement, status: "already exists" })
      } else {
        results.push({ sql: statement, status: `error: ${msg}` })
      }
    }
  }

  const hasErrors = results.some((r) => r.status.startsWith("error"))
  return NextResponse.json({ ok: !hasErrors, results }, { status: hasErrors ? 500 : 200 })
}
