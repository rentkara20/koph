// Notion mirror consumer for the OI-2 outbox (P9). Translates asset domain
// events into one-way Notion upserts, replacing the old "manual full
// re-scan" as the primary sync path. No-ops (not a failure) for non-asset
// events and when sync is disabled/unconfigured — must never block the
// drain for events Notion doesn't care about.
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import type * as schema from "@/lib/db/schema"
import { isNotionSyncEnabled, upsertAssetInNotion, type NotionAssetRow } from "@/lib/integrations/notion"
import { getNotionAssetRows } from "@/lib/actions/notion-sync"

type NotionDb = LibSQLDatabase<typeof schema>

export interface DomainEventForNotion {
  id: string
  eventType: string
  aggregateType: string
  aggregateId: string
  actorUserId: string | null
  payload: Record<string, unknown>
}

// db handle injected, upsert injected — mirrors the *Core(tx, ...) testability
// pattern used elsewhere and lets tests avoid a real Notion API call.
export async function deliverNotionForEvent(
  db: NotionDb,
  event: DomainEventForNotion,
  upsert: (row: NotionAssetRow) => Promise<void> = upsertAssetInNotion
): Promise<void> {
  if (event.aggregateType !== "asset") return
  if (!(await isNotionSyncEnabled())) return

  const [row] = await getNotionAssetRows(db, event.aggregateId)
  if (!row) return // un-tagged or since-deleted unit — nothing to key on in Notion

  await upsert(row)
}
