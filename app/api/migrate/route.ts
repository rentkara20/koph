import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// One-time migration endpoint — adds quote_number column to request table
// Visit /api/migrate once, then this route can be deleted
export async function GET() {
  try {
    await db.run(sql`ALTER TABLE request ADD COLUMN quote_number TEXT`)
    return NextResponse.json({ ok: true, message: "Migration applied: quote_number column added." })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Column already exists — that's fine
    if (msg.includes("duplicate column") || msg.includes("already exists")) {
      return NextResponse.json({ ok: true, message: "Column already exists — nothing to do." })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
