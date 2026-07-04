import { eq, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { notifications, users } from "@/lib/db/schema"
import { createId } from "./ids"

interface NotifyOptions {
  userId: string
  type: string
  i18nKey: string
  i18nData?: Record<string, string | number>
  linkUrl?: string
  entityType?: string
  entityId?: string
}

/**
 * Creates one in-app notification. Best-effort: notification failures must
 * never break the mutation that triggered them, so callers should not await
 * this inside a critical path without catching.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  await db.insert(notifications).values({
    id: createId(),
    userId: opts.userId,
    type: opts.type,
    i18nKey: opts.i18nKey,
    i18nData: opts.i18nData ? JSON.stringify(opts.i18nData) : null,
    linkUrl: opts.linkUrl ?? null,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
  })
}

/** Fan-out a notification to every active admin user. */
export async function notifyAdmins(
  opts: Omit<NotifyOptions, "userId">
): Promise<void> {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))

  await Promise.all(admins.map((a) => notify({ ...opts, userId: a.id })))
}
