// The Transactional Outbox emitter (OI-2). Call emitDomainEvent(tx, ...) inside
// the SAME transaction as the business state change it describes. Guarantees:
//   1. idempotent emit — a duplicate call with the same dedupeKey creates no
//      second domain_event row (unique index + onConflictDoNothing)
//   2. one event_delivery row per registered consumer, fanned out atomically
//      with the event row
//   3. never partially applied — event + all delivery rows land together or
//      the whole transaction (including the caller's state change) rolls back
import { eq } from "drizzle-orm"
import { after } from "next/server"
import { db } from "@/lib/db"
import { domainEvents, eventDeliveries } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { CONSUMERS, type DomainEventType } from "@/lib/domain/domain-events"

// Best-effort immediate drain (OI-2 closure item 4). `after()` runs once the
// response has been sent, keeping the serverless function alive just long
// enough to drain — so notifications don't wait for the daily cron in the
// common case. The daily cron remains the ONLY reliability guarantee: this
// trigger is fire-and-forget and must never delay or fail the emit itself.
// Outside a request scope (tests, one-off scripts) `after()` throws
// synchronously — swallowed here since those callers rely on the cron path.
function triggerImmediateDrainBestEffort() {
  try {
    after(async () => {
      try {
        const { drainEventDeliveries } = await import("@/lib/actions/event-drain")
        await drainEventDeliveries()
      } catch (error) {
        console.error("domain-events: best-effort drain failed, daily cron will retry", error)
      }
    })
  } catch {
    // no request scope (test/script context) — the daily cron covers it
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface EmitDomainEventInput {
  aggregateType: string
  aggregateId: string
  eventType: DomainEventType
  payload: Record<string, unknown>
  dedupeKey: string
  actorUserId?: string | null
}

export interface EmitDomainEventResult {
  eventId: string
  created: boolean // false when the dedupeKey already existed (no-op)
}

export async function emitDomainEvent(tx: Tx, event: EmitDomainEventInput): Promise<EmitDomainEventResult> {
  const id = createId()

  const inserted = await tx
    .insert(domainEvents)
    .values({
      id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: JSON.stringify(event.payload),
      dedupeKey: event.dedupeKey,
      actorUserId: event.actorUserId ?? null,
    })
    .onConflictDoNothing({ target: domainEvents.dedupeKey })
    .returning({ id: domainEvents.id })

  if (inserted.length === 0) {
    // Already emitted under this dedupeKey — idempotent no-op.
    const [existing] = await tx
      .select({ id: domainEvents.id })
      .from(domainEvents)
      .where(eq(domainEvents.dedupeKey, event.dedupeKey))
    return { eventId: existing.id, created: false }
  }

  const eventId = inserted[0].id
  for (const consumer of CONSUMERS) {
    await tx.insert(eventDeliveries).values({
      id: createId(),
      eventId,
      consumer,
      status: "pending",
    })
  }

  triggerImmediateDrainBestEffort()

  return { eventId, created: true }
}
