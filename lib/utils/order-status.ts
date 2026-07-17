// Badge variant per order status. Shared by list + detail views.

type Variant = "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "outline"

export const orderStatusVariant: Record<string, Variant> = {
  draft: "outline",
  confirmed: "info",
  partially_fulfilled: "warning",
  fulfilled: "success",
  cancelled: "secondary",
}

export const orderStatuses = [
  "draft",
  "confirmed",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
] as const

// Unit status badge variants (device instances).
export const unitStatusVariant: Record<string, Variant> = {
  receiving_qc: "warning",
  in_stock: "outline",
  assigned: "info",
  delivered: "success",
  returned: "secondary",
  damaged: "destructive",
  supplier_return_pending: "warning",
  supplier_returned: "secondary",
}

export const unitStatuses = [
  "receiving_qc",
  "in_stock",
  "reserved",
  "assigned",
  "delivered",
  "returned",
  "maintenance",
  "damaged",
  "supplier_return_pending",
  "supplier_returned",
  "retired",
  "sold",
  "lost",
] as const

type OrderStatus = (typeof orderStatuses)[number]
type UnitStatus = (typeof unitStatuses)[number]

// Order status is derived from its units' fulfillment, not set by hand.
// "cancelled" is the only status a human sets directly (see cancelOrder).
export function deriveOrderStatus(
  unitStatuses: UnitStatus[],
  currentStatus: OrderStatus
): OrderStatus {
  if (currentStatus === "cancelled") return "cancelled"
  if (unitStatuses.length === 0) return "draft"

  // receiving_qc units are not yet available stock, but they are also not
  // fulfilled toward the customer — treat like in_stock for order fulfilment.
  const notCustomerFulfilled = new Set<UnitStatus>([
    "in_stock",
    "receiving_qc",
    "supplier_return_pending",
    "supplier_returned",
  ])
  const fulfilled = unitStatuses.filter((status) => !notCustomerFulfilled.has(status)).length
  if (fulfilled === 0) return "confirmed"
  if (fulfilled === unitStatuses.length) return "fulfilled"
  return "partially_fulfilled"
}
