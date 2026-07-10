import { timingSafeEqual } from "crypto"
import { drainEventDeliveries } from "@/lib/actions/event-drain"

function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

// Drains the OI-2 transactional outbox. Triggered by Vercel Cron (see
// vercel.json) with a shared secret. Each run claims a bounded batch, invokes
// consumers, and advances delivery status — no long-running worker.
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await drainEventDeliveries()
  return Response.json(result)
}
