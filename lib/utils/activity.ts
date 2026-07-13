import { db } from "@/lib/db"
import { activityLogs } from "@/lib/db/schema"
import { createId } from "./ids"

type EntityType = "request" | "partner_task" | "signature_request" | "payment_batch" | "purchase_order"
type PerformedAs = "user" | "partner_link" | "system"

interface LogActivityOptions {
  entityType: EntityType
  entityId: string
  action: string
  i18nKey: string
  i18nData?: Record<string, string | number>
  performedBy?: string
  performedAs?: PerformedAs
  ipAddress?: string
}

// Minimal shape shared by `db` and a transaction handle, so callers can write the
// audit row inside the same transaction as the state change it records (OI-0:
// state + audit must be atomic). Defaults to the top-level `db` connection.
type DbLike = Pick<typeof db, "insert">

export async function logActivity(opts: LogActivityOptions, executor: DbLike = db) {
  await executor.insert(activityLogs).values({
    id: createId(),
    entityType: opts.entityType,
    entityId: opts.entityId,
    action: opts.action,
    i18nKey: opts.i18nKey,
    i18nData: opts.i18nData ? JSON.stringify(opts.i18nData) : null,
    performedBy: opts.performedBy ?? null,
    performedAs: opts.performedAs ?? "user",
    ipAddress: opts.ipAddress ?? null,
  })
}
