// Outbox drain (OI-2C). Claims pending event_delivery rows whose nextAttemptAt
// has passed, invokes the matching consumer, and advances status. No
// long-running worker assumption — this runs to completion inside one cron
// invocation and exits; the cron schedule is the reliability path, not an
// in-process loop.
import { and, asc, eq, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { domainEvents, eventDeliveries } from "@/lib/db/schema"
import { CONSUMERS, nextRetryDelayMs, isDead, type Consumer } from "@/lib/domain/domain-events"

const DRAIN_BATCH_SIZE = 50

// Both consumers are no-op/verification-only for OI-2 — they exist so the
// delivery fan-out and retry machinery can be proven end-to-end before the
// real Notification Hub / projections work is built (out of scope here).
const CONSUMER_HANDLERS: Record<Consumer, (payload: unknown, eventType: string) => Promise<void>> = {
  projections: async () => {},
  notifications: async () => {},
}

export interface DrainResult {
  claimed: number
  delivered: number
  failed: number
  dead: number
  oldestPendingAgeMs: number | null
}

export async function drainEventDeliveries(): Promise<DrainResult> {
  const now = Date.now()

  // Failed rows become claimable again once their backoff window passes.
  await db
    .update(eventDeliveries)
    .set({ status: "pending" })
    .where(and(eq(eventDeliveries.status, "failed"), lte(eventDeliveries.nextAttemptAt, now)))

  const [oldestPending] = await db
    .select({ createdAt: eventDeliveries.createdAt })
    .from(eventDeliveries)
    .where(eq(eventDeliveries.status, "pending"))
    .orderBy(asc(eventDeliveries.createdAt))
    .limit(1)

  const claimable = await db
    .select({
      deliveryId: eventDeliveries.id,
      consumer: eventDeliveries.consumer,
      attempts: eventDeliveries.attempts,
      eventId: eventDeliveries.eventId,
      eventType: domainEvents.eventType,
      payload: domainEvents.payload,
    })
    .from(eventDeliveries)
    .innerJoin(domainEvents, eq(domainEvents.id, eventDeliveries.eventId))
    .where(and(eq(eventDeliveries.status, "pending"), lte(eventDeliveries.nextAttemptAt, now)))
    .orderBy(asc(eventDeliveries.nextAttemptAt))
    .limit(DRAIN_BATCH_SIZE)

  let delivered = 0
  let failed = 0
  let dead = 0

  for (const row of claimable) {
    const handler = CONSUMER_HANDLERS[row.consumer as Consumer]
    try {
      await handler(JSON.parse(row.payload), row.eventType)
      await db
        .update(eventDeliveries)
        .set({ status: "delivered", deliveredAt: Date.now(), attempts: row.attempts + 1 })
        .where(eq(eventDeliveries.id, row.deliveryId))
      delivered++
    } catch (error) {
      const attempts = row.attempts + 1
      const message = error instanceof Error ? error.message : String(error)
      if (isDead(attempts)) {
        await db
          .update(eventDeliveries)
          .set({ status: "dead", attempts, lastError: message })
          .where(eq(eventDeliveries.id, row.deliveryId))
        dead++
      } else {
        await db
          .update(eventDeliveries)
          .set({
            status: "failed",
            attempts,
            lastError: message,
            nextAttemptAt: Date.now() + nextRetryDelayMs(attempts),
          })
          .where(eq(eventDeliveries.id, row.deliveryId))
        failed++
      }
    }
  }

  return {
    claimed: claimable.length,
    delivered,
    failed,
    dead,
    oldestPendingAgeMs: oldestPending ? now - oldestPending.createdAt : null,
  }
}

export const _consumers = CONSUMERS
