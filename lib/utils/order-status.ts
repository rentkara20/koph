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
  in_stock: "outline",
  assigned: "info",
  delivered: "success",
  returned: "secondary",
  damaged: "destructive",
}

export const unitStatuses = [
  "in_stock",
  "reserved",
  "assigned",
  "delivered",
  "returned",
  "maintenance",
  "damaged",
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

  const fulfilled = unitStatuses.filter((s) => s !== "in_stock").length
  if (fulfilled === 0) return "confirmed"
  if (fulfilled === unitStatuses.length) return "fulfilled"
  return "partially_fulfilled"
}
