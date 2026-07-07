"use server"

import { and, count, desc, eq, isNull, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { getSession } from "@/lib/auth/session"
import { getNotificationRetentionDays } from "@/lib/actions/settings"

export type NotificationItem = {
  id: string
  type: string
  i18nKey: string
  i18nData: Record<string, string | number> | null
  linkUrl: string | null
  readAt: number | null
  createdAt: number
}

const MAX_NOTIFICATIONS = 30

export async function getMyNotifications(): Promise<NotificationItem[]> {
  const session = await getSession()
  if (!session) return []

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(MAX_NOTIFICATIONS)

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    i18nKey: r.i18nKey,
    i18nData: r.i18nData ? (JSON.parse(r.i18nData) as Record<string, string | number>) : null,
    linkUrl: r.linkUrl,
    readAt: r.readAt,
    createdAt: r.createdAt,
  }))
}

export async function getUnreadCount(): Promise<number> {
  const session = await getSession()
  if (!session) return 0

  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))

  return row?.value ?? 0
}

/** Prune notifications older than the admin-configured retention window (Settings → Notifications). */
export async function pruneOldNotifications(): Promise<{ deleted: number }> {
  const retentionDays = await getNotificationRetentionDays()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const result = await db.delete(notifications).where(lt(notifications.createdAt, cutoff))
  return { deleted: (result as { rowsAffected?: number }).rowsAffected ?? 0 }
}

export async function markNotificationRead(id: string): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  // Scope the update to the caller's own notifications.
  await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)))

  return {}
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }

  await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))

  return {}
}
