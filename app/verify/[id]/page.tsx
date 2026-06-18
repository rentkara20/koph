import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  signatureRequests,
  customerSignatures,
  customers,
  requests,
} from "@/lib/db/schema"
import { formatAuditDateTime } from "@/lib/utils/format"

const PURPLE = "#512A83"

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [sigReq] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.verificationId, id))

  if (!sigReq) {
    return <VerifyLayout status="not_found" verificationId={id} />
  }

  const [customerRow] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, sigReq.customerId))

  let requestNumber: string | null = null
  let quoteNumber: string | null = null
  if (sigReq.requestId) {
    const [reqRow] = await db
      .select({ requestNumber: requests.requestNumber, quoteNumber: requests.quoteNumber })
      .from(requests)
      .where(eq(requests.id, sigReq.requestId))
    requestNumber = reqRow?.requestNumber ?? null
    quoteNumber = reqRow?.quoteNumber ?? null
  }

  const [sig] = await db
    .select({
      fullName: customerSignatures.fullName,
      signedAt: customerSignatures.signedAt,
    })
    .from(customerSignatures)
    .where(eq(customerSignatures.signatureRequestId, sigReq.id))

  const isSigned = sigReq.status === "signed" && !!sig

  return (
    <VerifyLayout
      status={isSigned ? "verified" : "pending"}
      verificationId={id}
      requestNumber={requestNumber}
      quoteNumber={quoteNumber}
      customerName={customerRow?.name ?? null}
      recipientName={sig?.fullName ?? null}
      signedAt={sig?.signedAt ?? null}
    />
  )
}

function VerifyLayout({
  status,
  verificationId,
  requestNumber,
  quoteNumber,
  customerName,
  recipientName,
  signedAt,
}: {
  status: "verified" | "pending" | "not_found"
  verificationId: string
  requestNumber?: string | null
  quoteNumber?: string | null
  customerName?: string | null
  recipientName?: string | null
  signedAt?: number | null
}) {
  const statusConfig = {
    verified: {
      badge: "✓ Verified",
      badgeBg: "#16a34a",
      badgeAr: "تم التحقق",
      message: "This document has been electronically signed and verified.",
      messageAr: "تم توقيع هذه الوثيقة إلكترونياً والتحقق منها.",
    },
    pending: {
      badge: "⏳ Pending",
      badgeBg: "#d97706",
      badgeAr: "في الانتظار",
      message: "This document has not been signed yet.",
      messageAr: "لم يتم توقيع هذه الوثيقة بعد.",
    },
    not_found: {
      badge: "✗ Not Found",
      badgeBg: "#dc2626",
      badgeAr: "غير موجود",
      message: "No document found with this Verification ID.",
      messageAr: "لا توجد وثيقة بهذا المعرف.",
    },
  }

  const cfg = statusConfig[status]

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f5f5f7",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: 'Arial, Helvetica, "Tahoma", sans-serif',
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        maxWidth: 480,
        width: "100%",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ background: PURPLE, padding: "20px 24px" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
            Rent Kara — Document Verification
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
            Electronic Signature Audit
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", direction: "rtl", marginTop: 2 }}>
            التحقق من التوقيع الإلكتروني
          </div>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {/* Status badge */}
          <div style={{ marginBottom: 20 }}>
            <span style={{
              display: "inline-block",
              background: cfg.badgeBg,
              color: "#fff",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 13,
              fontWeight: 700,
            }}>
              {cfg.badge} / {cfg.badgeAr}
            </span>
            <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
              {cfg.message}
              <br />
              <span style={{ direction: "rtl", display: "block", marginTop: 2 }}>{cfg.messageAr}</span>
            </p>
          </div>

          {/* Details */}
          {status !== "not_found" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                <DetailRow label="Verification ID" value={verificationId} mono />
                {requestNumber && <DetailRow label="Request Number" value={requestNumber} mono />}
                {quoteNumber && <DetailRow label="Quote Number" value={quoteNumber} mono />}
                {customerName && <DetailRow label="Customer" value={customerName} />}
                {recipientName && <DetailRow label="Recipient Name" value={recipientName} />}
                {signedAt && <DetailRow label="Signed At" value={formatAuditDateTime(signedAt)} />}
                <DetailRow
                  label="Document Status"
                  value={status === "verified" ? "Signed & Verified ✓" : "Pending"}
                />
              </tbody>
            </table>
          )}

          <div style={{
            marginTop: 20,
            padding: "12px 14px",
            background: "#f9fafb",
            borderRadius: 8,
            fontSize: 11,
            color: "#888",
            lineHeight: 1.5,
          }}>
            This verification page is provided by Rent Kara (koph.vercel.app).
            For support, contact abdelrahman.ali@rentkara.com
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td style={{ padding: "8px 0", color: "#666", fontWeight: 600, width: "40%", verticalAlign: "top" }}>
        {label}
      </td>
      <td style={{
        padding: "8px 0 8px 12px",
        fontFamily: mono ? "monospace" : "inherit",
        fontSize: mono ? 12 : 13,
        wordBreak: "break-all",
      }}>
        {value}
      </td>
    </tr>
  )
}
