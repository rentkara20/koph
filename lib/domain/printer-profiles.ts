/**
 * Printer profiles.
 *
 * The label design is a full-label bitmap, so switching printers changes only
 * two things: the dot grid it is rendered on and the small command envelope
 * wrapped around it. Keeping both as data means a printer can be adopted by
 * selecting a profile — no code change, no redesign, and no reprint of
 * anything already stuck on a device.
 *
 * Burn settings (darkness/speed) are per-printer. Where a profile is marked
 * uncalibrated, those values are the manufacturer's defaults and still need
 * one test label against the real hardware.
 */

export type PrinterLanguage = "zpl" | "pdf"

export type PrinterProfile = {
  id: string
  label: string
  language: PrinterLanguage
  /** Printhead resolution. Every profile here is 203 dpi. */
  dpi: number
  /**
   * Dots per millimetre used for the mm→dots conversion.
   *
   * 203 dpi is nominally 7.992 dots/mm, but Honeywell and Zebra both document
   * and address the head as a flat 8 dots/mm. Following the vendor convention
   * keeps our dot counts identical to their published table (50 mm = 400,
   * 108 mm = 864) instead of drifting a dot at wide sizes.
   */
  dotsPerMm: number
  /** Physical limit of the printhead — a design wider than this is clipped. */
  maxPrintableWidthMm: number
  /** ^MD darkness (0–30) and ^PR speed in ips. */
  darkness: number
  speedIps: number
  /** True only when darkness/speed were confirmed on real hardware. */
  calibrated: boolean
  notes: string
}

export const PRINTER_PROFILES: PrinterProfile[] = [
  {
    id: "honeywell_pc42e_203",
    label: "Honeywell PC42E-T (PC42E-TB02200) — 203 dpi",
    language: "zpl",
    dpi: 203,
    dotsPerMm: 8,
    // Datasheet: 108 mm (4.25 in) maximum printable width.
    maxPrintableWidthMm: 108,
    darkness: 10,
    // Datasheet default 4 ips (max 6). Starting slow-ish keeps edges crisp on
    // small text until the ribbon/stock combination is proven.
    speedIps: 4,
    calibrated: false,
    notes: "ZSim2 = متوافقة مع ZPL II · تحتاج ملصق تجربة واحد لضبط الغمقان",
  },
  {
    id: "zebra_gk420t_203",
    label: "Zebra GK420T — 203 dpi",
    language: "zpl",
    dpi: 203,
    dotsPerMm: 8,
    // Measured: 832-dot head = 104 mm.
    maxPrintableWidthMm: 104,
    darkness: 10,
    speedIps: 2,
    // Verified on the physical printer: 203 dots measured 25 mm, and
    // ^MD10/^PR2 produced clean output on 50×25 mm thermal-transfer stock.
    calibrated: true,
    notes: "معايرة مؤكدة على الجهاز",
  },
  {
    id: "pdf_any_printer",
    label: "أي طابعة عبر PDF / نافذة الطباعة",
    language: "pdf",
    // Rasterised at the same 203 dpi grid and then placed at exact
    // millimetres, so the page equals the physical label and the printer's own
    // driver does no scaling.
    dpi: 203,
    dotsPerMm: 8,
    maxPrintableWidthMm: 108,
    darkness: 10,
    speedIps: 4,
    calibrated: true,
    notes: "تعمل مع أي طابعة لها تعريف على النظام — بدون معرفة لغتها",
  },
]

export const DEFAULT_PROFILE_ID = "honeywell_pc42e_203"

export function getProfile(id: string): PrinterProfile {
  return PRINTER_PROFILES.find((p) => p.id === id) ?? PRINTER_PROFILES[0]
}

// ─── Physical label size ────────────────────────────────────────────────────
// Never guessed. The operator sets it to the stock actually loaded; these are
// only the last values agreed for the current roll.

export const DEFAULT_LABEL_WIDTH_MM = 50
export const DEFAULT_LABEL_HEIGHT_MM = 25

/** Datasheet media limits for the PC42E-T. */
export const MIN_LABEL_WIDTH_MM = 25.4
export const MIN_LABEL_HEIGHT_MM = 9.6

export type LabelSizeMm = { widthMm: number; heightMm: number }

export const DEFAULT_LABEL_SIZE: LabelSizeMm = {
  widthMm: DEFAULT_LABEL_WIDTH_MM,
  heightMm: DEFAULT_LABEL_HEIGHT_MM,
}

/**
 * Label size in printer dots: dots = mm × dotsPerMm, per the vendor's own
 * conversion table.
 */
export function labelDots(p: PrinterProfile, size: LabelSizeMm): { width: number; height: number } {
  return {
    width: Math.round(size.widthMm * p.dotsPerMm),
    height: Math.round(size.heightMm * p.dotsPerMm),
  }
}

export type SizeProblem = "too_narrow" | "too_short" | "wider_than_head"

/**
 * Refuses a size the hardware cannot actually print before a batch is
 * generated. Printing wider than the head silently clips the right-hand side —
 * which on this design is the QR code.
 */
export function checkLabelSize(p: PrinterProfile, size: LabelSizeMm): SizeProblem[] {
  const problems: SizeProblem[] = []
  if (size.widthMm < MIN_LABEL_WIDTH_MM) problems.push("too_narrow")
  if (size.heightMm < MIN_LABEL_HEIGHT_MM) problems.push("too_short")
  if (size.widthMm > p.maxPrintableWidthMm) problems.push("wider_than_head")
  return problems
}

/**
 * ZPL command envelope.
 *
 * ^MTT thermal transfer (ribbon), ^MNY gap sensing, ^MD darkness, ^PR speed,
 * ^CI28 UTF-8. ZSim2 on the Honeywell accepts these as ZPL II.
 */
export function zplHeader(p: PrinterProfile, size: LabelSizeMm): string {
  const { width, height } = labelDots(p, size)
  return (
    `^XA\n^PW${width}\n^LL${height}\n^LH0,0\n^LT0\n` +
    `^MTT\n^MNY\n^MD${p.darkness}\n^PR${p.speedIps}\n^CI28\n`
  )
}
