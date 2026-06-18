import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

export async function GET() {
  try {
    await db.run(sql`ALTER TABLE customer_contact ADD COLUMN city TEXT`)
    return NextResponse.json({ ok: true, message: "Migration applied: city column added to customer_contact." })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("duplicate column") || msg.includes("already exists")) {
      return NextResponse.json({ ok: true, message: "Column already exists — nothing to do." })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
