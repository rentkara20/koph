/**
 * Device-portal constants and pure helpers.
 *
 * Kept out of lib/actions/device-portal.ts because a "use server" module may
 * only export async functions — types, constants and the serial normaliser
 * live here so client components can import them too.
 */

// ─── Service catalogue (admin-configurable, no migration to change) ─────────

export const SERVICES_SETTING_KEY = "device_portal_services"
export const MODE_SETTING_KEY = "device_portal_mode"

export type DeviceService = {
  key: string
  labelAr: string
  labelEn: string
  /** Free-text note box shown under the action. */
  note: boolean
  /** Proposes corrections to the device's own fields (brand/model/type). */
  editsDeviceData: boolean
  enabled: boolean
}

/** Shipped defaults — overridden the moment an admin saves the setting. */
export const DEFAULT_SERVICES: DeviceService[] = [
  {
    key: "device_data",
    labelAr: "تعديل بيانات الجهاز",
    labelEn: "Correct device data",
    note: true,
    editsDeviceData: true,
    enabled: true,
  },
  {
    key: "maintenance",
    labelAr: "فتح تذكرة صيانة",
    labelEn: "Open maintenance ticket",
    note: true,
    editsDeviceData: false,
    enabled: true,
  },
  {
    key: "question",
    labelAr: "سؤال فني",
    labelEn: "Technical question",
    note: true,
    editsDeviceData: false,
    enabled: true,
  },
  {
    key: "stocktake",
    labelAr: "تأكيد الجرد",
    labelEn: "Confirm stocktake",
    note: true,
    editsDeviceData: false,
    // Off by default: switched on only during a stocktake window.
    enabled: false,
  },
]

// ─── Serial normalisation ───────────────────────────────────────────────────
// The printed URL carries the serial with separators stripped and uppercased,
// so `KR-000123` and `kr000123` both resolve. Compare on the same normal form.

export function normaliseSerial(raw: string): string {
  return decodeURIComponent(raw).replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

