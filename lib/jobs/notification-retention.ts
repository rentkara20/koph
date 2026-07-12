// Notification retention pruning. Kept in a plain module (NOT "use server") so
// it is not exposed as a directly-callable RPC endpoint — it takes no arguments
// and destructively deletes rows, so as an action any anonymous caller could
// force-prune ahead of schedule. Invoked only by the secret-guarded cron route
// (app/api/cron/weekly-summary).
import { lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { getNotificationRetentionDays } from "@/lib/actions/settings"

/** Prune notifications older than the admin-configured retention window (Settings → Notifications). */
export async function pruneOldNotifications(): Promise<{ deleted: number }> {
  const retentionDays = await getNotificationRetentionDays()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const result = await db.delete(notifications).where(lt(notifications.createdAt, cutoff))
  return { deleted: (result as { rowsAffected?: number }).rowsAffected ?? 0 }
}
