import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

export async function GET() {
  try {
    await db.run(sql`
      ALTER TABLE request ADD COLUMN receiver_contact_id TEXT REFERENCES customer_contact(id) ON DELETE SET NULL
    `)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes("duplicate column")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
