/**
 * Label-studio pure logic: geometry, validation, and ZPL packing.
 *
 * The printed label is physical hardware — 50×25 mm at 203 dpi on a Zebra
 * GK420T, empirically calibrated. These numbers are not preferences; changing
 * one changes what comes out of a printer already loaded with stock.
 */

import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PROFILE_ID,
  getProfile,
  type LabelSizeMm,
  zplHeader,
} from "./printer-profiles"

// ─── Verified GK420T geometry (the default profile) ───────────────────────────────────────────────

export const DPI = 203
/** 50 mm × 203 dpi */
export const LABEL_W = 400
/** 25 mm × 203 dpi */
export const LABEL_H = 200

/**
 * ^MTT thermal transfer (ribbon), ^MNY gap sensing, ^MD10 darkness, ^PR2
 * speed — all measured on the real printer. ^CI28 is UTF-8.
 */
export const ZPL_HEADER =
  `^XA\n^PW${LABEL_W}\n^LL${LABEL_H}\n^LH0,0\n^LT0\n^MTT\n^MNY\n^MD10\n^PR2\n^CI28\n`

/**
 * Fallback prefix printed on every sticker. The live value comes from the
 * server (LABEL_BASE_URL) and is passed into the client as a prop — this
 * module is imported by client code, so it must not read process.env: in a
 * browser bundle that is either undefined or a hard ReferenceError.
 *
 * Pilot batches carry the Vercel host; production batches must not be printed
 * until this is the owned subdomain, because a printed value can never be
 * changed afterwards.
 */
export const DEFAULT_LABEL_BASE_URL = "koph.vercel.app/d/"

// ─── Serial rules ───────────────────────────────────────────────────────────

/**
 * The printed URL carries the serial with separators stripped and uppercased.
 * Must stay identical to lib/domain/device-portal.normaliseSerial — the QR is
 * useless if the two disagree.
 */
export function serialKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

/** Longest serial that still fits under the QR at 6pt. */
export const MAX_SERIAL_LEN = 18

export type RowIssue = "empty" | "too_long" | "no_alnum" | "duplicate_in_file" | "already_exists"

export type ParsedRow = {
  rowNumber: number
  serialNumber: string
  serialKey: string
  brand: string
  model: string
  deviceType: string
  issues: RowIssue[]
}

/** Header aliases accepted on upload, so a KOPH asset export drops straight in. */
const FIELD_ALIASES: Record<string, string[]> = {
  serialNumber: ["serial", "serial number", "serial_number", "الرقم التسلسلي", "السيريال"],
  brand: ["brand", "make", "manufacturer", "الماركة"],
  model: ["model", "specs", "specification", "الموديل", "المواصفات"],
  deviceType: ["type", "device type", "device_type", "category", "نوع الجهاز", "النوع"],
}

export function resolveHeaders(headers: string[]): Record<string, string | null> {
  const lower = headers.map((h) => h.trim().toLowerCase())
  const out: Record<string, string | null> = {}
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = lower.findIndex((h) => aliases.includes(h))
    out[field] = idx >= 0 ? headers[idx] : null
  }
  return out
}

/**
 * Turns uploaded rows into validated label rows. Nothing is written here —
 * the caller shows the result and the operator decides. `existingKeys` are
 * serials already registered (as a real asset or an earlier batch), so a
 * device never ends up with two different QR codes.
 */
export function validateRows(
  rows: Record<string, string>[],
  headers: string[],
  existingKeys: Set<string>
): ParsedRow[] {
  const map = resolveHeaders(headers)
  const seen = new Set<string>()

  return rows.map((row, i) => {
    const pick = (field: string) => {
      const header = map[field]
      return header ? (row[header] ?? "").trim() : ""
    }

    const serialNumber = pick("serialNumber")
    const key = serialKey(serialNumber)
    const issues: RowIssue[] = []

    if (!serialNumber) issues.push("empty")
    else if (!key) issues.push("no_alnum")
    else if (serialNumber.length > MAX_SERIAL_LEN) issues.push("too_long")

    if (key) {
      if (seen.has(key)) issues.push("duplicate_in_file")
      else seen.add(key)
      if (existingKeys.has(key)) issues.push("already_exists")
    }

    return {
      rowNumber: i + 2, // +1 for the header row, +1 for 1-based
      serialNumber,
      serialKey: key,
      brand: pick("brand"),
      model: pick("model"),
      deviceType: pick("deviceType"),
      issues,
    }
  })
}

export function isPrintable(row: ParsedRow): boolean {
  return row.issues.length === 0
}

// ─── ZPL bitmap packing ─────────────────────────────────────────────────────

/**
 * Packs a 1-bit-per-pixel bitmap into a ^GFA field.
 *
 * `mono` is one byte per pixel in row-major order: non-zero means black. Rows
 * are padded to a byte boundary because the printer reads whole bytes per row;
 * getting this wrong shears the image diagonally.
 */
export function packGfa(mono: Uint8Array, width: number, height: number): string {
  const bytesPerRow = Math.ceil(width / 8)
  const total = bytesPerRow * height
  const bytes = new Uint8Array(total)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mono[y * width + x]) {
        bytes[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
  }

  let hex = ""
  for (const b of bytes) hex += b.toString(16).padStart(2, "0").toUpperCase()

  return `^GFA,${total},${total},${bytesPerRow},${hex}`
}

/**
 * One complete label: the printer's command envelope + the full-label bitmap.
 *
 * The envelope comes from the printer profile, so adopting a different printer
 * (or a 300 dpi head) is a profile selection rather than a code change.
 */
export function labelZpl(
  mono: Uint8Array,
  width: number,
  height: number,
  profileId: string = DEFAULT_PROFILE_ID,
  size: LabelSizeMm = DEFAULT_LABEL_SIZE
): string {
  const profile = getProfile(profileId)
  return `${zplHeader(profile, size)}^FO0,0${packGfa(mono, width, height)}^FS\n^PQ1\n^XZ\n`
}
