// Shared shape + label for a device handed over on a delivery task. Kept out of
// lib/excel so the client bundle never pulls exceljs in just to format a name.

export type DeliveredDevice = {
  description: string
  brand?: string | null
  model?: string | null
  serial?: string | null
  quantity: number
}

// Above this many units, a caller should show the count and point at the
// per-device listing instead of an inline list — a truncated list of serials
// reads as complete and would be reconciled against as if it were.
export const INLINE_DEVICE_LIMIT = 5

// One human-readable device line: "Dell Latitude 5440 — SN12345 ×2".
export function formatDevice(device: DeliveredDevice): string {
  const name = [device.brand, device.model].filter(Boolean).join(" ") || device.description
  const serial = device.serial ? ` — ${device.serial}` : ""
  const qty = device.quantity > 1 ? ` ×${device.quantity}` : ""
  return `${name}${serial}${qty}`
}
