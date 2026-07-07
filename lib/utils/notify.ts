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
 * Creates one in-app notification. Genuinely best-effort: the insert is
 * caught internally so a notification failure can never throw into — and
 * break — the mutation that triggered it. Callers do not need their own
 * try/catch around this.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  try {
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
  } catch (error) {
    console.error("notify: failed to write notification", opts.type, error)
  }
}

/**
 * Fan-out a notification to every active admin user. Uses allSettled so one
 * failed insert can't sink the rest of the batch.
 */
export async function notifyAdmins(
  opts: Omit<NotifyOptions, "userId">
): Promise<void> {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))

  await Promise.allSettled(admins.map((a) => notify({ ...opts, userId: a.id })))
}
