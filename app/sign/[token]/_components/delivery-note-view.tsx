import type { DeliveryNoteData } from "@/lib/actions/delivery-notes"
import { formatDate } from "@/lib/utils/format"

const PURPLE = "#512A83"
const BLUE = "#60B5D1"

function formatDeliveryDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return formatDate(ts)
}

export function DeliveryNoteView({
  data,
  printMode = false,
}: {
  data: DeliveryNoteData
  printMode?: boolean
}) {
  const { sig, request, customer, items, signature } = data
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)

  const containerStyle: React.CSSProperties = printMode
    ? { width: "100%", fontFamily: "Arial, sans-serif", fontSize: 13, color: "#111" }
    : {
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
        fontSize: 13,
        color: "#111",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
      }

  return (
    <div style={containerStyle} id="delivery-note-root">
      {/* ── Header ── */}
      <div
        style={{
          background: PURPLE,
          color: "#fff",
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo / brand */}
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: 1 }}>RENT KARA</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            رنت كارا · Operations & Delivery
          </div>
        </div>
        {/* Title */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Delivery Note</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
            سند التسليم
          </div>
        </div>
      </div>

      {/* ── Reference row ── */}
      <div
        style={{
          background: "#f8f5ff",
          borderBottom: `2px solid ${PURPLE}`,
          padding: "10px 24px",
          display: "flex",
          flexWrap: "wrap",
          gap: "24px",
          fontSize: 12,
        }}
      >
        {request?.quoteNumber && (
          <div>
            <span style={{ color: "#666" }}>Quote No. / رقم الطلب: </span>
            <strong style={{ fontFamily: "monospace" }}>{request.quoteNumber}</strong>
          </div>
        )}
        <div>
          <span style={{ color: "#666" }}>Request No. / رقم الطلب الداخلي: </span>
          <strong style={{ fontFamily: "monospace" }}>{request?.requestNumber ?? "—"}</strong>
        </div>
        <div>
          <span style={{ color: "#666" }}>Delivery Date / تاريخ التسليم: </span>
          <strong>{formatDeliveryDate(request?.deliveryDate)}</strong>
        </div>
        <div>
          <span style={{ color: "#666" }}>Document / المستند: </span>
          <strong>{sig.documentName}</strong>
        </div>
      </div>

      {/* ── Customer info ── */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            <InfoRow
              labelEn="Customer Name"
              labelAr="اسم العميل"
              value={customer?.name ?? "—"}
            />
            {customer?.contactPerson && (
              <InfoRow
                labelEn="Contact Person"
                labelAr="الشخص المسؤول"
                value={customer.contactPerson}
              />
            )}
            {customer?.mobile && (
              <InfoRow labelEn="Mobile" labelAr="الجوال" value={customer.mobile} />
            )}
            {customer?.email && (
              <InfoRow labelEn="Email" labelAr="البريد الإلكتروني" value={customer.email} />
            )}
          </tbody>
        </table>
      </div>

      {/* ── Devices section header ── */}
      <div
        style={{
          background: BLUE,
          color: "#fff",
          padding: "8px 24px",
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        <span>Devices &amp; Items Information</span>
        <span style={{ fontFamily: "Arial, sans-serif" }}>معلومات الأجهزة والمعدات</span>
      </div>

      {/* ── Items table ── */}
      <div style={{ padding: "0 24px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            marginTop: 0,
          }}
        >
          <thead>
            <tr style={{ background: "#f0f4f8" }}>
              <Th style={{ width: 36 }}>#</Th>
              <Th>Serial Number / الرقم التسلسلي</Th>
              <Th>Device Specs / مواصفات الجهاز</Th>
              <Th style={{ width: 50, textAlign: "center" }}>Qty / الكمية</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ padding: "16px 12px", textAlign: "center", color: "#999" }}
                >
                  No items
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 ? "#fafafa" : "#fff" }}
                >
                  <Td style={{ color: "#999", textAlign: "center" }}>{idx + 1}</Td>
                  <Td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {item.serialNumber ?? "—"}
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{item.description}</div>
                    {(item.brand || item.model) && (
                      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                        {[item.brand, item.model].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {item.accessories && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                        + {item.accessories}
                      </div>
                    )}
                  </Td>
                  <Td style={{ textAlign: "center", fontWeight: 700 }}>{item.quantity}</Td>
                </tr>
              ))
            )}
            {/* Total row */}
            <tr style={{ background: "#f0f4f8", fontWeight: 700 }}>
              <td
                colSpan={3}
                style={{
                  padding: "8px 12px",
                  textAlign: "right",
                  borderTop: "2px solid #e2e8f0",
                  fontSize: 13,
                }}
              >
                Total / المجموع الكلي
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  textAlign: "center",
                  borderTop: "2px solid #e2e8f0",
                  fontSize: 14,
                  color: PURPLE,
                }}
              >
                {totalQty}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Acknowledgement ── */}
      <div
        style={{
          margin: "16px 24px",
          padding: "14px 16px",
          background: "#fff8f0",
          border: "1px solid #f0d9a0",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        <p style={{ marginBottom: 6, fontWeight: 600, color: PURPLE }}>
          Acknowledgement / إقرار الاستلام
        </p>
        <p style={{ marginBottom: 8, color: "#444" }}>
          I hereby confirm that I have received the above-mentioned devices and items in good
          condition, complete and fully functional. I acknowledge that the quantities and
          specifications listed above are accurate.
        </p>
        <p dir="rtl" style={{ textAlign: "right", color: "#444" }}>
          أقر وأتعهد بأنني استلمت الأجهزة والمعدات المذكورة أعلاه بحالة جيدة وكاملة وبصلاحية
          تامة، وأؤكد صحة الكميات والمواصفات المبينة في هذا السند.
        </p>
      </div>

      {/* ── Signature block ── */}
      <div
        style={{
          margin: "16px 24px 24px",
          borderTop: "2px solid " + PURPLE,
          paddingTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        {/* Received by */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 10 }}>
            Received By / استلم بواسطة
          </p>
          {signature ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#666" }}>Name / الاسم: </span>
                <strong>{signature.fullName}</strong>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#666" }}>Date / التاريخ: </span>
                <strong>{formatDate(signature.signedAt)}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>
                  Signature / التوقيع:
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signature.signatureData}
                  alt="Signature"
                  style={{
                    maxWidth: 200,
                    maxHeight: 80,
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    padding: 4,
                    background: "#fff",
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12 }}>
              <SignatureLine label="Name / الاسم" />
              <SignatureLine label="Date / التاريخ" />
              <SignatureLine label="Signature / التوقيع" tall />
            </div>
          )}
        </div>

        {/* Delivered by */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 10 }}>
            Delivered By / سلّم بواسطة
          </p>
          <div style={{ marginTop: 12 }}>
            <SignatureLine label="Name / الاسم" />
            <SignatureLine label="Date / التاريخ" />
            <SignatureLine label="Signature / التوقيع" tall />
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          background: PURPLE,
          color: "rgba(255,255,255,0.7)",
          padding: "10px 24px",
          textAlign: "center",
          fontSize: 11,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Rent Kara · rentkara.com</span>
        <span>هذا المستند صادر من نظام KOPH</span>
      </div>
    </div>
  )
}

function InfoRow({
  labelEn,
  labelAr,
  value,
}: {
  labelEn: string
  labelAr: string
  value: string
}) {
  return (
    <tr>
      <td style={{ padding: "4px 0", color: "#555", width: "35%", fontSize: 12 }}>
        {labelEn} / <span style={{ fontFamily: "Arial, sans-serif" }}>{labelAr}</span>
      </td>
      <td style={{ padding: "4px 0", fontWeight: 600 }}>{value}</td>
    </tr>
  )
}

function Th({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: "left",
        fontSize: 12,
        fontWeight: 700,
        color: "#333",
        borderBottom: "2px solid #d0d0d0",
        ...style,
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <td style={{ padding: "8px 12px", verticalAlign: "top", ...style }}>{children}</td>
  )
}

function SignatureLine({ label, tall }: { label: string; tall?: boolean }) {
  return (
    <div style={{ marginBottom: tall ? 16 : 10 }}>
      <span style={{ fontSize: 11, color: "#666" }}>{label}</span>
      <div
        style={{
          borderBottom: "1px solid #aaa",
          marginTop: 4,
          height: tall ? 48 : 20,
        }}
      />
    </div>
  )
}
