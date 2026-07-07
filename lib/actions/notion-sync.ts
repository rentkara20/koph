"use server"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, orderLines, orderUnits } from "@/lib/db/schema"
import { getSessionWithRole } from "@/lib/auth/session"
import { isNotionSyncEnabled, upsertAssetInNotion } from "@/lib/integrations/notion"

type SyncResult = { error?: string; synced?: number; failed?: number }

export async function syncAssetsToNotion(): Promise<SyncResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!(await isNotionSyncEnabled())) {
    return { error: "Notion sync is not configured or has been paused in Settings → Integrations." }
  }

  const rows = await db
    .select({
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      location: orderUnits.location,
      purchaseCost: orderUnits.purchaseCost,
      warrantyEnd: orderUnits.warrantyEnd,
      id: orderUnits.id,
      brand: orderLines.brand,
      model: orderLines.model,
      currentCustomerName: customers.name,
    })
    .from(orderUnits)
    .innerJoin(orderLines, eq(orderUnits.orderLineId, orderLines.id))
    .leftJoin(customers, eq(orderUnits.currentCustomerId, customers.id))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  let synced = 0
  let failed = 0
  for (const r of rows) {
    if (!r.assetTag) continue // un-tagged units have nothing to key on in Notion
    try {
      await upsertAssetInNotion({
        assetTag: r.assetTag,
        serialNumber: r.serialNumber,
        brand: r.brand,
        model: r.model,
        status: r.status,
        location: r.location,
        currentCustomerName: r.currentCustomerName,
        purchaseCost: r.purchaseCost,
        warrantyEnd: r.warrantyEnd,
        koph_link: `${appUrl}/admin/assets/${r.id}`,
      })
      synced++
    } catch (error) {
      console.error("syncAssetsToNotion: row failed", r.assetTag, error)
      failed++
    }
  }

  return { synced, failed }
}
