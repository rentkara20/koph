import QRCode from "qrcode"

// Renders a QR code as a data URL for embedding in printed/signed documents.
// Server-side only (called from server components).
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 160 })
}
