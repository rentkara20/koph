import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

export async function GET() {
  const results = []

  const migrations = [
    { column: "signature_request.verification_id", stmt: sql`ALTER TABLE signature_request ADD COLUMN verification_id TEXT` },
    { column: "customer_signature.signed_at_tz", stmt: sql`ALTER TABLE customer_signature ADD COLUMN signed_at_tz TEXT NOT NULL DEFAULT 'Asia/Riyadh'` },
    { column: "customer_signature.user_agent", stmt: sql`ALTER TABLE customer_signature ADD COLUMN user_agent TEXT` },
    { column: "customer_signature.audit_data_hash", stmt: sql`ALTER TABLE customer_signature ADD COLUMN audit_data_hash TEXT` },
  ]

  for (const { column, stmt } of migrations) {
    try {
      await db.run(stmt)
      results.push({ column, status: "applied" })
    } catch (e) {
      const msg = String(e)
      // LibSQL returns "Failed query" for duplicate columns — treat as already exists
      const alreadyExists =
        msg.includes("duplicate column") ||
        msg.includes("already exists") ||
        msg.includes("Failed query")
      results.push({ column, status: alreadyExists ? "already exists" : `error: ${msg}` })
    }
  }

  return NextResponse.json({ ok: true, results })
}
