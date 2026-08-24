import { groupIdenticalItems } from "./item-grouping"

export type ImportedRequestItem = {
  description: string
  brand: string
  model: string
  serialNumber: string
  quantity: number
  accessories: string
  notes: string
  /**
   * Every order unit this row stands for. Non-serialized units that are
   * otherwise identical (accessories, cables) collapse into ONE row whose
   * quantity is the unit count, so the operator sees "Adapter, qty 5" instead of
   * five identical rows. Persistence still writes one request_item per unit —
   * see expandRequestItemsByUnit.
   */
  orderUnitIds: string[]
}

export function buildRequestItemsFromOrderUnits(
  units: Array<{
    unitId: string
    description: string
    brand: string | null
    model: string | null
    serialNumber: string | null
  }>
): ImportedRequestItem[] {
  const grouped = groupIdenticalItems(
    units.map((unit) => ({
      id: unit.unitId,
      description: unit.description,
      brand: unit.brand,
      model: unit.model,
      serialNumber: unit.serialNumber,
      quantity: 1,
    }))
  )

  return grouped.map((row) => ({
    description: row.description ?? "",
    brand: row.brand ?? "",
    model: row.model ?? "",
    serialNumber: row.serialNumber ?? "",
    quantity: row.quantity,
    accessories: "",
    notes: "",
    orderUnitIds: row.groupedIds,
  }))
}

/**
 * Expand a form row back into one payload item per order unit. The DB keeps one
 * request_item per physical device (request_item_order_unit_qty_chk), so a
 * grouped row of five adapters becomes five quantity-1 items. A row with no unit
 * link is passed through with the typed quantity intact.
 */
export function expandRequestItemsByUnit<
  T extends { quantity: number; orderUnitIds?: string[] },
>(items: T[]): Array<Omit<T, "orderUnitIds"> & { quantity: number; orderUnitId?: string }> {
  return items.flatMap((item) => {
    const { orderUnitIds, ...rest } = item
    if (!orderUnitIds || orderUnitIds.length === 0) {
      return [{ ...rest, quantity: item.quantity }]
    }
    return orderUnitIds.map((orderUnitId) => ({ ...rest, quantity: 1, orderUnitId }))
  })
}
