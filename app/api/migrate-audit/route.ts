import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// Migration: adds audit fields — visit /api/migrate-audit once after deploy

export async function GET() {
  const results = []

  try {
    await db.run(sql`ALTER TABLE signature_request ADD COLUMN verification_id TEXT`)
    results.push({ column: "signature_request.verification_id", status: "applied" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ column: "signature_request.verification_id", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  try {
    await db.run(sql`ALTER TABLE customer_signature ADD COLUMN signed_at_tz TEXT NOT NULL DEFAULT 'Asia/Riyadh'`)
    results.push({ column: "customer_signature.signed_at_tz", status: "applied" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ column: "customer_signature.signed_at_tz", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  try {
    await db.run(sql`ALTER TABLE customer_signature ADD COLUMN user_agent TEXT`)
    results.push({ column: "customer_signature.user_agent", status: "applied" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ column: "customer_signature.user_agent", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  try {
    await db.run(sql`ALTER TABLE customer_signature ADD COLUMN audit_data_hash TEXT`)
    results.push({ column: "customer_signature.audit_data_hash", status: "applied" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ column: "customer_signature.audit_data_hash", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  const hasErrors = results.some((r) => r.status.startsWith("error"))
  return NextResponse.json({ ok: !hasErrors, results })
}
