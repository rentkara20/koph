import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// Migration: adds audit fields to signature_request and customer_signature tables
// Visit /api/migrate-audit once after deploy, then this route can be deleted

export async function GET() {
  const results: { column: string; status: string }[] = []

  const migrations: Array<{ column: string; fn: () => Promise<void> }> = [
    {
      column: "signature_request.verification_id",
      fn: () => db.run(sql`ALTER TABLE signature_request ADD COLUMN verification_id TEXT`),
    },
    {
      column: "customer_signature.signed_at_tz",
      fn: () => db.run(sql`ALTER TABLE customer_signature ADD COLUMN signed_at_tz TEXT NOT NULL DEFAULT 'Asia/Riyadh'`),
    },
    {
      column: "customer_signature.user_agent",
      fn: () => db.run(sql`ALTER TABLE customer_signature ADD COLUMN user_agent TEXT`),
    },
    {
      column: "customer_signature.audit_data_hash",
      fn: () => db.run(sql`ALTER TABLE customer_signature ADD COLUMN audit_data_hash TEXT`),
    },
  ]

  for (const { column, fn } of migrations) {
    try {
      await fn()
      results.push({ column, status: "applied" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        results.push({ column, status: "already exists" })
      } else {
        results.push({ column, status: `error: ${msg}` })
      }
    }
  }

  const hasErrors = results.some((r) => r.status.startsWith("error"))
  return NextResponse.json({ ok: !hasErrors, results }, { status: hasErrors ? 500 : 200 })
}
