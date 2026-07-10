// Notifications consumer for the OI-2 outbox. The drain invokes this per
// claimed `notifications` delivery. Translates a domain event into admin
// in-app notification rows. Idempotent: inserts carry a dedupeKey of
// `${eventId}:${userId}` with onConflictDoNothing, so a retried delivery
// never double-notifies.
import { and, eq, isNull, ne } from "drizzle-orm"
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import { notifications, users } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import {
  notificationLinkUrl,
  notificationTemplateForEvent,
  type EventContext,
} from "@/lib/domain/notification-templates"

type NotificationDb = LibSQLDatabase<typeof schema>

export interface DomainEventForNotification {
  id: string
  eventType: string
  aggregateType: string
  aggregateId: string
  actorUserId: string | null
  payload: Record<string, unknown>
}

// The db handle is injected so the drain passes the app singleton and tests
// pass an ephemeral database (mirrors the *Core(tx, ...) testability pattern).
export async function deliverNotificationsForEvent(
  db: NotificationDb,
  event: DomainEventForNotification
): Promise<void> {
  const ctx: EventContext = {
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
  }

  const template = notificationTemplateForEvent(event.eventType, ctx)
  if (!template) return // not a user-facing event — nothing to deliver

  // Admin cohort minus the actor who triggered the event (no self-notify).
  const actorFilter = event.actorUserId ? ne(users.id, event.actorUserId) : undefined
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt), actorFilter))

  if (admins.length === 0) return

  const linkUrl = notificationLinkUrl(ctx) ?? null
  const i18nData = template.i18nData ? JSON.stringify(template.i18nData) : null

  for (const admin of admins) {
    await db
      .insert(notifications)
      .values({
        id: createId(),
        userId: admin.id,
        type: template.type,
        i18nKey: template.i18nKey,
        i18nData,
        linkUrl,
        entityType: template.entityType ?? null,
        entityId: template.entityId ?? null,
        dedupeKey: `${event.id}:${admin.id}`,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
  }
}
