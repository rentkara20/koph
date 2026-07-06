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
  "assigned",
  "delivered",
  "returned",
  "damaged",
] as const
