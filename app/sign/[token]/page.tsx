import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { getSignatureByToken, recordSignatureOpened } from "@/lib/actions/signatures"
import { getDeliveryNoteData } from "@/lib/actions/delivery-notes"
import { formatDate } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { SignatureForm } from "./_components/signature-form"
import { DeliveryNoteView } from "./_components/delivery-note-view"
import { DownloadButton } from "./_components/download-button"

const PURPLE = "#512A83"
const BLUE = "#60B5D1"

type StatusVariant = "outline" | "info" | "success" | "secondary"

const STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: "outline",
  sent: "info",
  opened: "info",
  otp_verified: "info",
  signed: "success",
  rejected: "secondary",
  expired: "secondary",
  cancelled: "secondary",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Not active",
  sent: "Awaiting signature",
  opened: "Awaiting signature",
  otp_verified: "Awaiting signature",
  signed: "Signed ✓",
  rejected: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [data, deliveryNote] = await Promise.all([
    getSignatureByToken(token),
    getDeliveryNoteData(token),
  ])

  if (!data) notFound()

  const { sig, activeConsent, isExpired } = data

  if (sig.status === "sent") {
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined
    const ua = headersList.get("user-agent") ?? undefined
    await recordSignatureOpened(token, ip, ua)
  }

  const isTerminal = ["signed", "rejected", "expired", "cancelled"].includes(sig.status)
  const canSign = !isTerminal && !isExpired && sig.status !== "draft"
  const isSigned = sig.status === "signed"

  const now = Date.now()
  const isExpiringSoon =
    !isExpired &&
    !isTerminal &&
    sig.expiryEnabled &&
    sig.expiresAt !== null &&
    sig.expiresAt > now &&
    sig.expiresAt - now < 24 * 60 * 60 * 1000

  const consentText =
    activeConsent?.textEn ??
    "I confirm that the information provided is accurate and I agree to sign this document electronically."

  const items = deliveryNote?.items ?? []
  const request = deliveryNote?.request ?? null
  const customer = deliveryNote?.customer ?? null

  return (
    <div style={{ minHeight: "100svh", background: "#f5f5f5" }}>

      {/* ── Top header bar ── */}
      <div
        style={{
          background: PURPLE,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 600,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: 32,
              height: 32,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            K
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              KOPH · {sig.documentName}
            </div>
            {customer && (
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 1 }}>
                {customer.name}
              </div>
            )}
          </div>
          <Badge
            variant={STATUS_VARIANT[sig.status] ?? "outline"}
            className="shrink-0"
          >
            {STATUS_LABEL[sig.status] ?? sig.status}
          </Badge>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Error / status banners ── */}
        {isExpired && (
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e" }}>
            This signing link has expired. Contact the operations team.
          </div>
        )}
        {isExpiringSoon && (
          <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9a3412" }}>
            ⚠️ This signing link expires soon. Please sign as soon as possible.
          </div>
        )}
        {sig.status === "draft" && !isExpired && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>
            This signing link is not active yet.
          </div>
        )}
        {sig.status === "cancelled" && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>
            This signature request has been cancelled.
          </div>
        )}
        {sig.status === "rejected" && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>
            This document signing was declined.
          </div>
        )}

        {/* ── SIGNED state: full delivery note + download ── */}
        {isSigned && deliveryNote && (
          <>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#166534", fontWeight: 600 }}>
              ✓ تم التوقيع بنجاح — Document signed successfully
            </div>
            <DeliveryNoteView data={deliveryNote} />
            <div style={{ display: "flex", gap: 10 }}>
              <DownloadButton token={token} />
            </div>
          </>
        )}

        {/* ── PRE-SIGN: items review card ── */}
        {!isSigned && (
          <>
            {/* Items card */}
            <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              {/* Card header */}
              <div
                style={{
                  background: PURPLE,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                    {sig.documentName}
                  </div>
                  {request?.requestNumber && (
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace", marginTop: 2 }}>
                      {request.requestNumber}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  {request?.quoteNumber && (
                    <div style={{ color: "#fff", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>
                      #{request.quoteNumber}
                    </div>
                  )}
                  {request?.deliveryDate && (
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>
                      {formatDate(request.deliveryDate)}
                    </div>
                  )}
                </div>
              </div>

              {/* Items table */}
              {items.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: BLUE }}>
                      <th style={{ padding: "8px 14px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 12 }}>
                        Item Specs
                      </th>
                      <th style={{ padding: "8px 10px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 12, width: 48 }}>
                        QTY
                      </th>
                      <th style={{ padding: "8px 14px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 12, width: "28%" }}>
                        Serial Number
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: "1px solid #f0f0f0",
                          background: idx % 2 ? "#fafafa" : "#fff",
                        }}
                      >
                        <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 600 }}>{item.description}</div>
                          {(item.brand || item.model) && (
                            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                              {[item.brand, item.model].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {item.accessories && (
                            <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>
                              + {item.accessories}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center", fontWeight: 700, verticalAlign: "top" }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#555", verticalAlign: "top" }}>
                          {item.serialNumber ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ background: "#f5f5f5", borderTop: "2px solid #e2e8f0" }}>
                      <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 13, textAlign: "right" }}>
                        الإجمالي / Total:
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, fontSize: 14, color: PURPLE }}>
                        {items.reduce((s, i) => s + i.quantity, 0)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "#999", fontSize: 13 }}>
                  No items listed
                </div>
              )}
            </div>

            {/* Document info row */}
            {(request?.quoteNumber || customer?.name) && (
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "8px 24px", fontSize: 12 }}>
                {customer?.name && (
                  <div>
                    <span style={{ color: "#999" }}>Prepared for / لصالح: </span>
                    <strong>{customer.name}</strong>
                  </div>
                )}
                {request?.quoteNumber && (
                  <div>
                    <span style={{ color: "#999" }}>Quote No. / رقم الطلب: </span>
                    <strong style={{ fontFamily: "monospace" }}>{request.quoteNumber}</strong>
                  </div>
                )}
                {request?.deliveryDate && (
                  <div>
                    <span style={{ color: "#999" }}>Delivery: </span>
                    <strong>{formatDate(request.deliveryDate)}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Signature flow */}
            {canSign && (
              <SignatureForm
                token={token}
                requireNationalId={sig.requireNationalId}
                documentName={sig.documentName}
                consentText={consentText}
              />
            )}
          </>
        )}

      </div>
    </div>
  )
}
