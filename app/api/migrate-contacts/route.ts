import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// One-time migration: creates customer_contact table
// Visit /api/migrate-contacts once after deploy
export async function GET() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS customer_contact (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT,
        mobile TEXT,
        email TEXT,
        address TEXT,
        maps_link TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    return NextResponse.json({ ok: true, message: "customer_contact table ready." })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
