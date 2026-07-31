// Maps a free-text city (Arabic or English) to its IATA-style short code used
// on delivery notes (e.g. "الرياض" / "Riyadh" → "RUH"). Falls back to the raw
// trimmed input when no mapping exists so no location detail is silently lost.

const CITY_TO_IATA: Record<string, string> = {
  // ── Saudi Arabia ──────────────────────────────────────────────────────────
  "الرياض": "RUH",
  "رياض": "RUH",
  riyadh: "RUH",
  ryadh: "RUH",

  "جدة": "JED",
  "جده": "JED",
  jeddah: "JED",
  jiddah: "JED",

  "الدمام": "DMM",
  "دمام": "DMM",
  dammam: "DMM",
  "الخبر": "DMM",
  khobar: "DMM",
  "الظهران": "DMM",
  dhahran: "DMM",

  "المدينة": "MED",
  "المدينة المنورة": "MED",
  madinah: "MED",
  medina: "MED",

  "مكة": "JED",
  "مكة المكرمة": "JED",
  makkah: "JED",
  mecca: "JED",

  "الطائف": "TIF",
  taif: "TIF",

  "تبوك": "TUU",
  tabuk: "TUU",

  "أبها": "AHB",
  "ابها": "AHB",
  abha: "AHB",

  "خميس مشيط": "AHB",
  "بريدة": "ELQ",
  "القصيم": "ELQ",
  buraidah: "ELQ",
  qassim: "ELQ",

  "حائل": "HAS",
  hail: "HAS",

  "جازان": "GIZ",
  "جيزان": "GIZ",
  jazan: "GIZ",
  jizan: "GIZ",

  "نجران": "EAM",
  najran: "EAM",

  "الأحساء": "HOF",
  "الاحساء": "HOF",
  "الهفوف": "HOF",
  hofuf: "HOF",
  ahsa: "HOF",

  "ينبع": "YNB",
  yanbu: "YNB",

  "عرعر": "RAE",
  arar: "RAE",

  "الجبيل": "DMM",
  jubail: "DMM",

  // ── UAE ─────────────────────────────────────────────────────────────────
  "دبي": "DXB",
  dubai: "DXB",

  "أبوظبي": "AUH",
  "ابوظبي": "AUH",
  "أبو ظبي": "AUH",
  "ابو ظبي": "AUH",
  "abu dhabi": "AUH",
  abudhabi: "AUH",

  "الشارقة": "SHJ",
  sharjah: "SHJ",
}

export function cityToIata(city?: string | null): string {
  if (!city) return ""
  const raw = city.trim()
  if (!raw) return ""
  const key = raw.toLowerCase()
  return CITY_TO_IATA[key] ?? CITY_TO_IATA[raw] ?? raw
}

/**
 * Builds the default signature-document name:
 *   "<Delivery Note|Collection Receipt> #<num> <customer>, <LOC>, P<part>"
 * Location is omitted when unknown. Legacy requests safely default to P1.
 *
 * The trailing "P<n>" marker is kept on collections even though a collection
 * carries no delivery part — extractDeliveryLocationLabel keys off it to find
 * the location slot, so dropping it would blank the City field on the note.
 */
export function buildDeliveryNoteName({
  documentNumber,
  customerName,
  city,
  deliveryPartNumber = 1,
  requestTypeSlug,
}: {
  documentNumber: string
  customerName?: string | null
  city?: string | null
  deliveryPartNumber?: number | null
  requestTypeSlug?: string | null
}): string {
  const kind = requestTypeSlug === "collection" ? "Collection Receipt" : "Delivery Note"
  const base = `${kind} #${documentNumber}${customerName ? ` ${customerName}` : ""}`
  const loc = cityToIata(city)
  const part = Math.max(1, deliveryPartNumber ?? 1)
  return loc ? `${base}, ${loc}, P${part}` : `${base}, P${part}`
}

/**
 * Extracts the delivery-location label ("<LOC>, P<n>") from a delivery-note
 * document name produced by buildDeliveryNoteName. Returns just "P<n>" when the
 * name has no location slot, or null when no trailing patch marker is present.
 * Used to print the delivery location (not the customer's registered city) in
 * the Delivery Note "City" field.
 */
export function extractDeliveryLocationLabel(documentName?: string | null): string | null {
  if (!documentName) return null
  const parts = documentName.split(/,\s*/)
  const last = parts[parts.length - 1]?.trim() ?? ""
  if (!/^P\d+$/.test(last)) return null
  if (parts.length >= 3) {
    const loc = parts[parts.length - 2]?.trim()
    return loc ? `${loc}, ${last}` : last
  }
  return last
}
