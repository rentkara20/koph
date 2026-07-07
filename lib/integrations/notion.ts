import { Client } from "@notionhq/client"

// One-way mirror: KOPH -> Notion. Soft-disabled until both env vars are set
// (see report for setup steps) — never blocks the caller. Uses the v5 SDK's
// data-source API (Notion's 2025-09 schema split databases into data sources).
export function isNotionSyncEnabled(): boolean {
  return Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATA_SOURCE_ID)
}

let client: Client | null = null
function getClient(): Client {
  if (!client) client = new Client({ auth: process.env.NOTION_API_KEY })
  return client
}

export type NotionAssetRow = {
  assetTag: string
  serialNumber: string | null
  brand: string | null
  model: string | null
  status: string
  location: string
  currentCustomerName: string | null
  purchaseCost: number | null
  warrantyEnd: number | null
  koph_link: string
}

// Upsert by Asset Tag: query the data source for a page with a matching
// title, update it if found, otherwise create it. No delete — retired assets
// just go stale with their last-known status, which is fine for a read mirror.
export async function upsertAssetInNotion(row: NotionAssetRow): Promise<void> {
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID!
  const notion = getClient()

  const existing = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: { property: "Asset Tag", title: { equals: row.assetTag } },
    page_size: 1,
  })

  const properties = {
    "Asset Tag": { title: [{ text: { content: row.assetTag } }] },
    "Serial Number": { rich_text: [{ text: { content: row.serialNumber ?? "" } }] },
    Brand: { rich_text: [{ text: { content: row.brand ?? "" } }] },
    Model: { rich_text: [{ text: { content: row.model ?? "" } }] },
    Status: { select: { name: row.status } },
    Location: { rich_text: [{ text: { content: row.location } }] },
    "Current Customer": { rich_text: [{ text: { content: row.currentCustomerName ?? "" } }] },
    "Purchase Cost": { number: row.purchaseCost },
    "Warranty End": row.warrantyEnd
      ? { date: { start: new Date(row.warrantyEnd).toISOString().slice(0, 10) } }
      : { date: null },
    "KOPH Link": { url: row.koph_link },
  }

  const page = existing.results[0]
  if (page) {
    await notion.pages.update({ page_id: page.id, properties })
  } else {
    await notion.pages.create({ parent: { data_source_id: dataSourceId }, properties })
  }
}
