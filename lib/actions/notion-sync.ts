"use server"

import { eq, sql } from "drizzle-orm"
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import { db } from "@/lib/db"
import { customers, orderLines, orderUnits, purchaseOrderLines } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"
import { getSessionWithRole } from "@/lib/auth/session"
import { isNotionSyncEnabled, upsertAssetInNotion, type NotionAssetRow } from "@/lib/integrations/notion"

type SyncResult = { error?: string; synced?: number; failed?: number }
type AnyDb = LibSQLDatabase<typeof schema>

// Shared row shape builder — used by the manual full-resync below and by the
// event-driven notion-consumer (P9) so both stay byte-identical.
export async function getNotionAssetRows(
  dbHandle: AnyDb,
  assetId?: string
): Promise<Array<NotionAssetRow & { id: string }>> {
  const query = dbHandle
    .select({
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      location: orderUnits.location,
      purchaseCost: orderUnits.purchaseCost,
      warrantyEnd: orderUnits.warrantyEnd,
      id: orderUnits.id,
      brand: sql<string | null>`coalesce(${orderLines.brand}, ${purchaseOrderLines.brand})`,
      model: sql<string | null>`coalesce(${orderLines.model}, ${purchaseOrderLines.model})`,
      currentCustomerName: customers.name,
    })
    .from(orderUnits)
    // LEFT joins on both origins — procurement assets must sync to Notion too.
    .leftJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(purchaseOrderLines, eq(orderUnits.purchaseOrderLineId, purchaseOrderLines.id))
    .leftJoin(customers, eq(orderUnits.currentCustomerId, customers.id))

  const rows = assetId ? await query.where(eq(orderUnits.id, assetId)) : await query

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return rows
    .filter((r) => r.assetTag) // un-tagged units have nothing to key on in Notion
    .map((r) => ({ ...r, assetTag: r.assetTag as string, koph_link: `${appUrl}/admin/assets/${r.id}` }))
}

export async function syncAssetsToNotion(): Promise<SyncResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!(await isNotionSyncEnabled())) {
    return { error: "Notion sync is not configured or has been paused in Settings → Integrations." }
  }

  const rows = await getNotionAssetRows(db)

  let synced = 0
  let failed = 0
  for (const r of rows) {
    try {
      await upsertAssetInNotion(r)
      synced++
    } catch (error) {
      console.error("syncAssetsToNotion: row failed", r.assetTag, error)
      failed++
    }
  }

  return { synced, failed }
}
