import { db } from "@/lib/db"
import { requests } from "@/lib/db/schema"
import { like, desc } from "drizzle-orm"

/**
 * Generates the next sequential request number in the format KR-YYYY-NNNNN.
 * Reads the last request number for the current year from the DB.
 * Safe for concurrent calls — the unique constraint on request_number is the
 * ultimate guard; this just provides a best-effort next value.
 */
export async function generateRequestNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `KR-${year}-`

  const last = await db
    .select({ requestNumber: requests.requestNumber })
    .from(requests)
    .where(like(requests.requestNumber, `${prefix}%`))
    .orderBy(desc(requests.requestNumber))
    .limit(1)

  const lastSeq = last[0]
    ? parseInt(last[0].requestNumber.replace(prefix, ""), 10)
    : 0

  const next = String(lastSeq + 1).padStart(5, "0")
  return `${prefix}${next}`
}
