import QRCode from "qrcode"
import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PROFILE_ID,
  getProfile,
  labelDots,
  type LabelSizeMm,
} from "@/lib/domain/printer-profiles"

/**
 * Draws the approved design-8 label into a canvas at 1 CSS pixel = 1 printer
 * dot (400×200 = 50×25 mm at 203 dpi).
 *
 * This canvas is BOTH the on-screen preview and the source of the printed
 * bitmap. One renderer, two outputs — the only way a preview can honestly
 * claim to show what will print.
 */

// Geometry from the approved HTML template, expressed in INCHES so the same
// design lands identically on a 203 dpi or a 300 dpi head. Multiplying by the
// profile's dpi is the only thing that changes between printers.
/**
 * Safe margin from the physical edge. Thermal stock wanders a fraction of a
 * millimetre as it feeds, so ink placed closer than this can walk off the
 * label.
 */
const SAFE_MARGIN_MM = 1
const QR_BOX_IN = 0.74
const LOGO_W_IN = 0.95
const GAP_MM = 0.75
const SERIAL_PT = 6 //   serial under the QR
const CTA_PT = 9.5 //    "Scan for Service"

export type LabelData = {
  serialNumber: string
  url: string
}

/**
 * QR is drawn module-by-module at an integer scale so every module lands on
 * whole printer dots. A fractionally-scaled QR blurs across dot boundaries and
 * scanners lose it — the exact failure that makes a sticker useless once it is
 * already on a device.
 */
function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, box: number) {
  // Error-correction M survives the scuffing a device in daily use gets.
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" })
  const size = qr.modules.size
  const quiet = 2 // modules of mandatory quiet zone
  const scale = Math.max(1, Math.floor(box / (size + quiet * 2)))
  const drawn = (size + quiet * 2) * scale
  // Centre whatever integer size we landed on inside the reserved box.
  const ox = x + Math.floor((box - drawn) / 2)
  const oy = y + Math.floor((box - drawn) / 2)

  ctx.fillStyle = "#fff"
  ctx.fillRect(ox, oy, drawn, drawn)
  ctx.fillStyle = "#000"
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) {
        ctx.fillRect(ox + (c + quiet) * scale, oy + (r + quiet) * scale, scale, scale)
      }
    }
  }
  return drawn
}

/** Loads the brand logo once per page. */
let logoPromise: Promise<HTMLImageElement> | null = null
export function loadLogo(src = "/kara-logo.png"): Promise<HTMLImageElement> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("logo_load_failed"))
      img.src = src
    })
  }
  return logoPromise
}

export function drawLabel(
  canvas: HTMLCanvasElement,
  data: LabelData,
  logo: HTMLImageElement,
  profileId: string = DEFAULT_PROFILE_ID,
  size: LabelSizeMm = DEFAULT_LABEL_SIZE
): void {
  const profile = getProfile(profileId)
  const { width: W, height: H } = labelDots(profile, size)
  const mm = (v: number) => Math.round(v * profile.dotsPerMm)
  const inch = (v: number) => Math.round(v * profile.dpi)
  const pt = (v: number) => Math.round((v / 72) * profile.dpi)

  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  // Pure black on pure white: a 203 dpi thermal head has no greys, so any
  // smoothing just becomes ragged dots.
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = "#000"

  const PAD = mm(SAFE_MARGIN_MM)
  const GAP = Math.max(2, mm(GAP_MM))

  // The QR is the one element that must never be squeezed — shrink it only if
  // the stock is genuinely smaller than the design's natural size.
  const QR_BOX = Math.min(inch(QR_BOX_IN), H - PAD * 2)
  const serialSize = pt(SERIAL_PT)
  const ctaSize = pt(CTA_PT)

  // Approved design 8 orientation: brand on the LEFT, scan target on the
  // RIGHT. The label reads left-to-right as "who this belongs to, then what to
  // do with it" — and it is the layout already signed off, so the sides are
  // not interchangeable.

  // ── Right half: QR with the serial directly beneath it ──
  const qrX = W - PAD - QR_BOX
  const blockH = QR_BOX + GAP + serialSize
  const qrY = Math.max(PAD, Math.round((H - blockH) / 2))
  drawQr(ctx, data.url, qrX, qrY, QR_BOX)

  ctx.font = `700 ${serialSize}px "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  // maxWidth keeps a long serial inside the label instead of running off the
  // right edge, where it would be clipped by the head.
  ctx.fillText(
    data.serialNumber,
    qrX + QR_BOX / 2,
    Math.min(qrY + QR_BOX + GAP, H - PAD - serialSize),
    QR_BOX + PAD * 2
  )

  // ── Left half: logo over the call to action ──
  const leftX = PAD
  const leftW = qrX - GAP * 2 - leftX
  if (leftW <= 0) return // stock too narrow for the brand half; QR still prints

  const logoW = Math.min(inch(LOGO_W_IN), leftW)
  const logoH = Math.round((logo.height / logo.width) * logoW)
  const leftBlockH = logoH + GAP + ctaSize
  const leftY = Math.max(PAD, Math.round((H - leftBlockH) / 2))
  const logoX = leftX + Math.round((leftW - logoW) / 2)

  ctx.drawImage(logo, logoX, leftY, logoW, logoH)

  ctx.font = `900 ${ctaSize}px "Helvetica Neue", Arial, sans-serif`
  ctx.fillStyle = "#000"
  ctx.fillText("Scan for Service", leftX + leftW / 2, leftY + logoH + GAP, leftW)
}

/**
 * Thresholds the rendered canvas to one byte per pixel (non-zero = black).
 * A thermal head is strictly black or white — there is no grey to print — so
 * anti-aliased edges must be resolved here rather than hoped about.
 */
export function canvasToMono(canvas: HTMLCanvasElement, threshold = 160): Uint8Array {
  const ctx = canvas.getContext("2d")
  if (!ctx) return new Uint8Array(0)
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)
  const mono = new Uint8Array(width * height)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const alpha = data[i + 3]
    // Rec. 601 luma; a transparent pixel is paper, not ink.
    const luma = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    mono[p] = alpha > 32 && luma < threshold ? 1 : 0
  }
  return mono
}
