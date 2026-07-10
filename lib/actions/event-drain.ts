// Outbox drain (OI-2C). Claims pending event_delivery rows whose nextAttemptAt
// has passed, invokes the matching consumer, and advances status. No
// long-running worker assumption — this runs to completion inside one cron
// invocation and exits; the cron schedule is the reliability path, not an
// in-process loop.
import { and, asc, eq, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { domainEvents, eventDeliveries } from "@/lib/db/schema"
import { CONSUMERS, nextRetryDelayMs, isDead, type Consumer } from "@/lib/domain/domain-events"
import { deliverNotificationsForEvent } from "@/lib/actions/notification-consumer"

const DRAIN_BATCH_SIZE = 50

// Normalized domain event handed to each consumer handler.
interface ConsumerEvent {
  id: string
  eventType: string
  aggregateType: string
  aggregateId: string
  actorUserId: string | null
  payload: Record<string, unknown>
}

// The `notifications` consumer (P7) translates events into admin in-app
// notifications. `projections` remains a verification-only no-op until the
// projections work lands.
const CONSUMER_HANDLERS: Record<Consumer, (event: ConsumerEvent) => Promise<void>> = {
  projections: async () => {},
  notifications: (event) => deliverNotificationsForEvent(db, event),
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
      aggregateType: domainEvents.aggregateType,
      aggregateId: domainEvents.aggregateId,
      actorUserId: domainEvents.actorUserId,
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
      await handler({
        id: row.eventId,
        eventType: row.eventType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        actorUserId: row.actorUserId,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
      })
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
