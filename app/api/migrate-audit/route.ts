import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

export async function GET() {
  // Step 1: read current table structure
  let tableInfo: unknown = null
  try {
    tableInfo = await db.run(sql`SELECT sql FROM sqlite_master WHERE type='table' AND name='customer_signature'`)
  } catch (e) {
    return NextResponse.json({ ok: false, step: "read_table", error: String(e) })
  }

  // Step 2: apply columns one by one with full error details
  const results = []

  try {
    await db.run(sql`ALTER TABLE customer_signature ADD COLUMN signed_at_tz TEXT`)
    results.push({ column: "signed_at_tz", status: "applied" })
  } catch (e) {
    const msg = String(e)
    results.push({ column: "signed_at_tz", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  try {
    await db.run(sql`ALTER TABLE customer_signature ADD COLUMN user_agent TEXT`)
    results.push({ column: "user_agent", status: "applied" })
  } catch (e) {
    const msg = String(e)
    results.push({ column: "user_agent", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  try {
    await db.run(sql`ALTER TABLE customer_signature ADD COLUMN audit_data_hash TEXT`)
    results.push({ column: "audit_data_hash", status: "applied" })
  } catch (e) {
    const msg = String(e)
    results.push({ column: "audit_data_hash", status: msg.includes("duplicate") || msg.includes("already exists") ? "already exists" : `error: ${msg}` })
  }

  const hasErrors = results.some((r) => r.status.startsWith("error"))
  return NextResponse.json({ ok: !hasErrors, tableInfo, results })
}
