// Display-level grouping of identical request items.
//
// One order_unit is one physical device, so an accessory ordered five times is
// five request_item rows (request_item_order_unit_qty_chk enforces quantity 1 on
// any order-linked row). That is correct for stock accounting but reads badly on
// a delivery note and in the request form, where "Adapter x 5" is the useful
// line. This collapses interchangeable rows for DISPLAY ONLY — never for
// persistence — so the stored rows and the printed line can never disagree.
//
// A row carrying a serial number identifies one specific device and is never
// grouped: the serial is the whole point of the line.

export type GroupableItem = {
  id: string
  description: string | null
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  quantity: number
  accessories?: string | null
  condition?: string | null
}

export type GroupedItem<T> = T & {
  /** Summed quantity across the collapsed rows. */
  quantity: number
  /** Ids of every row folded into this line, in original order. */
  groupedIds: string[]
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase()

function groupKey(item: GroupableItem): string | null {
  // Serialized rows stay standalone.
  if (norm(item.serialNumber)) return null
  return [
    norm(item.description),
    norm(item.brand),
    norm(item.model),
    norm(item.accessories),
    norm(item.condition),
  ].join("|")
}

/**
 * Collapse interchangeable (non-serialized, otherwise identical) rows into one
 * line whose quantity is the sum. First-occurrence order is preserved so the
 * grouped list reads in the same sequence as the source list.
 */
export function groupIdenticalItems<T extends GroupableItem>(items: T[]): GroupedItem<T>[] {
  const out: GroupedItem<T>[] = []
  const byKey = new Map<string, GroupedItem<T>>()

  for (const item of items) {
    const key = groupKey(item)
    if (key === null) {
      out.push({ ...item, groupedIds: [item.id] })
      continue
    }
    const existing = byKey.get(key)
    if (existing) {
      existing.quantity += item.quantity
      existing.groupedIds.push(item.id)
      continue
    }
    const row: GroupedItem<T> = { ...item, groupedIds: [item.id] }
    byKey.set(key, row)
    out.push(row)
  }

  return out
}
