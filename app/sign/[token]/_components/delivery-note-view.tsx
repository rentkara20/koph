import type { DeliveryNoteData } from "@/lib/actions/delivery-notes"
import { formatDate } from "@/lib/utils/format"

const PURPLE = "#512A83"
const BLUE = "#60B5D1"
const LIGHT_GRAY = "#E5E5E5"

function formatDeliveryDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return formatDate(ts)
}

const RentKaraLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 746.28 323.4"
    style={{ width: 160, height: 69, display: "block" }}
    aria-label="Rent Kara"
  >
    <path
      fill="#512b83"
      d="M2.78,113.31a27.1,27.1,0,0,0,41.79,21.81L195.51,37.59a2.89,2.89,0,0,0,.19-4.71,160.38,160.38,0,0,0-194.57,0A2.87,2.87,0,0,0,0,35.31l.06,1.14Z"
    />
    <path
      fill="#512b83"
      d="M2.78,210.09a27.1,27.1,0,0,1,41.79-21.81l150.94,97.53a2.89,2.89,0,0,1,.19,4.71,160.42,160.42,0,0,1-194.57,0A2.89,2.89,0,0,1,0,288.08l.06-1.14Z"
    />
    <path
      fill="#60b5d0"
      d="M260.32,161.51c0-.72,0-1.45,0-2.17q0-3-.21-6a163.8,163.8,0,0,0-29.26-84.63,3.06,3.06,0,0,0-5-1.11q-45.52,27.2-91,54.54-18.95,11.4-37.94,22.72c-3.84,2.3-7.86,4.73-10.48,8.47A12.76,12.76,0,0,0,85.5,155a15.52,15.52,0,0,0-1.65,6.75h0v.11h0a15.52,15.52,0,0,0,1.65,6.75,12.76,12.76,0,0,0,.94,1.59c2.62,3.74,6.64,6.16,10.48,8.47q19,11.35,37.94,22.72,45.44,27.35,91,54.53a3,3,0,0,0,5-1.1,163.8,163.8,0,0,0,29.26-84.63q.17-3,.21-6c0-.72,0-1.45,0-2.17v-.49"
    />
    <path
      fill="#1e2730"
      d="M383.78,144.76c1.24,2,1.53,3.67.89,5s-2.05,2-4.22,2H377a7.35,7.35,0,0,1-6.66-3.89l-25-42.72H323.28V146q0,5.84-5.5,5.84h-1.47c-3.72,0-5.57-1.95-5.57-5.84V66.69q0-11.91,5.34-17.34t18.2-5.43h10.38q20.29,0,30.44,6.93t10.15,23.63q0,13.53-6.66,20.59t-19.91,9.07Zm-60.5-77.17v25h22.54q14.42,0,20.61-4.25t6.19-13.94q0-9.69-6.15-13.87T345.82,56.4H334.28q-6.5,0-8.75,2.84t-2.25,8.35"
    />
    <path
      fill="#1e2730"
      d="M451.5,151.81q-12.86,0-18.2-5.43T428,129V66.69q0-11.91,5.35-17.34t18.2-5.43h39.2c3.71,0,5.57,1.91,5.57,5.75v1c0,3.9-1.86,5.81-5.57,5.76H452.59q-7.21,0-9.65,2.76c-1.62,1.83-2.44,4.64-2.44,8.43v23.5h42.22q5.58,0,5.58,5.84v.89q0,5.84-5.58,5.84H440.5v24.48c0,3.78.82,6.58,2.44,8.39s4.84,2.71,9.65,2.71H494q5.58,0,5.58,5.84V146q0,5.84-5.58,5.84Z"
    />
    <path
      fill="#1e2730"
      d="M546,151.81q-5.58,0-5.58-5.84V61.67q0-10.38,3.49-14.07t11.39-3.68A16.27,16.27,0,0,1,565.51,47q4,3.07,7.86,12.64L605.59,135a9.58,9.58,0,0,0,1.9,3.24,3,3,0,0,0,2.13.81q3,0,3-4.38V49.67q0-5.84,5.58-5.75h1.39c3.72,0,5.58,1.91,5.58,5.75v84.39q0,10.37-3.45,14.06t-11.35,3.69a16.51,16.51,0,0,1-10.3-3.08q-4-3.09-7.9-12.73l-32.3-75.22a10.59,10.59,0,0,0-1.78-3.25,2.89,2.89,0,0,0-2.17-.89q-3,0-3,4.46V146q0,5.84-5.5,5.84Z"
    />
    <path
      fill="#1e2730"
      d="M740.7,43.92c3.72,0,5.58,1.91,5.58,5.75v1q0,5.84-5.58,5.76H710V146q0,5.84-5.58,5.84h-1.54q-5.58,0-5.58-5.84V56.4H666.66q-5.58,0-5.58-5.76v-1q0-5.84,5.58-5.75Z"
    />
    <path
      fill="#1e2730"
      d="M381.68,287.81h-7.61c-4.52,0-8.25-1.25-10.24-4.15l-34.42-44.08v40.59c0,4.9-2.62,7.64-7.29,7.64h-7.78c-4.68,0-7.29-2.74-7.29-7.64V187.54c0-4.9,2.61-7.64,7.29-7.64h7.78c4.67,0,7.29,2.74,7.29,7.64v39.92l34.42-43.58c2-2.74,5.72-4,10.24-4h7.45c6.59,0,9.68,3.65,6.27,8.13l-36.65,45.49,36.73,46.15c3.25,4.4.39,8.14-6.19,8.14"
    />
    <path
      fill="#1e2730"
      d="M491,281.33l-5.71-21.25H440.93l-5.72,21.25c-1.18,4.32-3.88,6.48-8.16,6.48h-8.17c-5.24,0-7.62-3.4-6.11-8.63l21-73.3c5.79-20.59,13.56-27.48,29.34-27.48s23.88,6.81,29.35,27.48l21,73.3c1.51,5.23-.87,8.63-6.11,8.63h-8.25c-4.28,0-7-2.16-8.17-6.48M471.3,207.87c-2.06-7.3-4-9.46-8.17-9.46s-6.1,2.16-8.17,9.46l-8.8,32.71H480Z"
    />
    <path
      fill="#1e2730"
      d="M613.83,287.81H603.36c-4,0-6.74-1.74-8.56-5.48L575.52,243.4H560.77v36.77c0,4.9-2.62,7.64-7.3,7.64H545.7c-4.68,0-7.3-2.74-7.3-7.64V203.72c0-17.26,7.54-23.82,24.59-23.82h13.17c28.07,0,44.73,7.3,44.73,32.29,0,17.1-7.77,25.65-22.84,29.22l20.78,37.27c2.93,5.31.79,9.13-5,9.13m-35.21-62.59c15.14,0,19.9-4.32,19.9-13.2s-4.76-13-19.9-13H567.27c-5.47,0-6.5,3-6.5,6.89v19.34Z"
    />
    <path
      fill="#1e2730"
      d="M722,281.33l-5.71-21.25H672l-5.72,21.25c-1.18,4.32-3.88,6.48-8.16,6.48h-8.17c-5.24,0-7.62-3.4-6.11-8.63l21-73.3c5.79-20.59,13.56-27.48,29.34-27.48s23.88,6.81,29.35,27.48l21,73.3c1.51,5.23-.87,8.63-6.11,8.63h-8.25c-4.28,0-7-2.16-8.17-6.48m-19.67-73.46c-2.06-7.3-4-9.46-8.17-9.46s-6.1,2.16-8.17,9.46l-8.8,32.71h33.87Z"
    />
  </svg>
)

export function DeliveryNoteView({
  data,
  printMode = false,
}: {
  data: DeliveryNoteData
  printMode?: boolean
}) {
  const { request, customer, items, signature } = data
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)

  const outerStyle: React.CSSProperties = printMode
    ? {
        width: "100%",
        fontFamily: "Arial, sans-serif",
        fontSize: 13,
        color: "#1e2730",
        background: "#fff",
      }
    : {
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
        fontSize: 13,
        color: "#1e2730",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      }

  return (
    <div style={outerStyle} id="delivery-note-root">

      {/* ── HEADER: logo left, title right, purple bg ── */}
      <div
        style={{
          background: PURPLE,
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <RentKaraLogo />
        <div style={{ textAlign: "right", color: "#fff" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>
            Delivery Note
          </div>
          <div
            dir="rtl"
            style={{ fontSize: 18, fontWeight: 700, marginTop: 2, opacity: 0.9 }}
          >
            سند تسليم
          </div>
        </div>
      </div>

      {/* ── INFO TABLE ── */}
      <div style={{ padding: "0 24px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            marginTop: 0,
          }}
        >
          <tbody>
            <InfoRow
              labelEn="Quote Number"
              labelAr="رقم الطلب"
              value={request?.quoteNumber ?? "—"}
            />
            <InfoRow
              labelEn="Delivery Date"
              labelAr="تاريخ التسليم"
              value={formatDeliveryDate(request?.deliveryDate)}
            />
            <InfoRow
              labelEn="Prepared For"
              labelAr="تم اعداده لصالح"
              value={customer?.name ?? "—"}
            />
            {(customer?.contactPerson) && (
              <InfoRow
                labelEn="Point of Contact"
                labelAr="مسؤول التواصل"
                value={customer.contactPerson}
              />
            )}
            {customer?.mobile && (
              <InfoRow
                labelEn="Phone Number"
                labelAr="رقم الجوال"
                value={customer.mobile}
              />
            )}
            {customer?.email && (
              <InfoRow
                labelEn="E-mail"
                labelAr="البريد الإلكتروني"
                value={customer.email}
              />
            )}
          </tbody>
        </table>
      </div>

      {/* ── DEVICES SECTION HEADER ── */}
      <div
        style={{
          background: BLUE,
          color: "#fff",
          padding: "9px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 700,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        <span>Devices Information</span>
        <span dir="rtl">معلومات الأجهزة</span>
      </div>

      {/* ── DEVICES TABLE ── */}
      <div style={{ padding: "0 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: LIGHT_GRAY }}>
              <th
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: 12,
                  borderBottom: `2px solid #ccc`,
                  width: "28%",
                }}
              >
                Serial Number
                <br />
                <span dir="rtl" style={{ fontWeight: 400, fontSize: 11, color: "#555" }}>
                  الرقم التسلسلي
                </span>
              </th>
              <th
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: 12,
                  borderBottom: `2px solid #ccc`,
                }}
              >
                Device Specs
                <br />
                <span dir="rtl" style={{ fontWeight: 400, fontSize: 11, color: "#555" }}>
                  وصف الجهاز
                </span>
              </th>
              <th
                style={{
                  padding: "8px 12px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 12,
                  borderBottom: `2px solid #ccc`,
                  width: 64,
                }}
              >
                QTY
                <br />
                <span dir="rtl" style={{ fontWeight: 400, fontSize: 11, color: "#555" }}>
                  الكمية
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  style={{ padding: "16px 12px", textAlign: "center", color: "#999" }}
                >
                  No items
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    background: idx % 2 ? "#fafafa" : "#fff",
                  }}
                >
                  <td
                    style={{
                      padding: "9px 12px",
                      fontFamily: "monospace",
                      fontSize: 12,
                      verticalAlign: "top",
                    }}
                  >
                    {item.serialNumber ?? "—"}
                  </td>
                  <td style={{ padding: "9px 12px", verticalAlign: "top" }}>
                    <span style={{ fontWeight: 600 }}>{item.description}</span>
                    {(item.brand || item.model) && (
                      <span style={{ color: "#666", fontSize: 12 }}>
                        {" "}
                        {[item.brand, item.model].filter(Boolean).join(" ")}
                      </span>
                    )}
                    {item.accessories && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                        + {item.accessories}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      textAlign: "center",
                      fontWeight: 700,
                      verticalAlign: "top",
                    }}
                  >
                    {item.quantity}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS ── */}
      <div
        style={{
          padding: "8px 24px 12px",
          textAlign: "right",
          fontSize: 13,
          fontWeight: 700,
          borderTop: `2px solid ${LIGHT_GRAY}`,
        }}
      >
        <span>Total Qty: {totalQty}</span>
        <span dir="rtl" style={{ marginRight: 24 }}>
          &nbsp;&nbsp;إجمالي الكمية: {totalQty}
        </span>
      </div>

      {/* ── ACKNOWLEDGEMENT ── */}
      <div
        style={{
          margin: "8px 24px 16px",
          padding: "14px 18px",
          border: `1px solid ${LIGHT_GRAY}`,
          borderRadius: 6,
          textAlign: "center",
          fontSize: 12,
          lineHeight: 1.8,
          color: "#333",
        }}
      >
        <p style={{ marginBottom: 6 }}>
          I confirm that I have inspected the devices and items, verified the quantities, and
          received them in good condition.
        </p>
        <p dir="rtl">
          أقر بأنني قمت بفحص الأجهزة والمنتجات والتحقق من الكميات، واستلمتها بحالة جيدة.
        </p>
      </div>

      {/* ── SIGNATURE BLOCK ── */}
      <div
        style={{
          margin: "0 24px 20px",
          padding: "16px 24px",
          border: `1px solid ${LIGHT_GRAY}`,
          borderRadius: 6,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: PURPLE,
            marginBottom: 16,
          }}
        >
          Signature of the Receiver &nbsp;/&nbsp;{" "}
          <span dir="rtl">توقيع المستلم</span>
        </p>

        {signature ? (
          /* Signed state — show embedded data */
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              textAlign: "left",
            }}
          >
            <SigField labelEn="Name" labelAr="الاسم" value={signature.fullName} />
            <SigField labelEn="Date" labelAr="التاريخ" value={formatDate(signature.signedAt)} />
            <div style={{ gridColumn: "1 / -1" }}>
              <p style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                Signature / التوقيع
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signature.signatureData}
                alt="Signature"
                style={{
                  maxWidth: 240,
                  maxHeight: 90,
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  padding: 6,
                  background: "#fff",
                }}
              />
            </div>
          </div>
        ) : (
          /* Blank state — lines for manual signing */
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px 32px",
              maxWidth: 480,
              margin: "0 auto",
            }}
          >
            <BlankLine label="Name / الاسم" />
            <BlankLine label="Date / التاريخ" />
            <div style={{ gridColumn: "1 / -1" }}>
              <BlankLine label="Signature / التوقيع" tall />
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div
        style={{
          background: LIGHT_GRAY,
          padding: "10px 24px",
          textAlign: "center",
          fontSize: 11,
          color: "#555",
          lineHeight: 1.7,
        }}
      >
        <p>
          Kindly sign and return the Delivery Note to complete the delivery process.
        </p>
        <p dir="rtl">
          نأمل التكرم بالتوقيع وإعادة إرسال سند التسليم لاستكمال إجراءات التسليم.
        </p>
      </div>
    </div>
  )
}

/* ── Helper sub-components ── */

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
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td
        style={{
          padding: "7px 8px 7px 0",
          width: "22%",
          color: "#555",
          fontSize: 12,
          verticalAlign: "top",
        }}
      >
        {labelEn}
      </td>
      <td
        style={{
          padding: "7px 12px",
          width: "40%",
          fontWeight: 600,
          verticalAlign: "top",
        }}
      >
        {value}
      </td>
      <td
        dir="rtl"
        style={{
          padding: "7px 0 7px 8px",
          width: "22%",
          color: "#555",
          fontSize: 12,
          textAlign: "right",
          verticalAlign: "top",
        }}
      >
        {labelAr}
      </td>
    </tr>
  )
}

function SigField({
  labelEn,
  labelAr,
  value,
}: {
  labelEn: string
  labelAr: string
  value: string
}) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
        {labelEn} / {labelAr}
      </p>
      <p style={{ fontWeight: 600 }}>{value}</p>
    </div>
  )
}

function BlankLine({ label, tall }: { label: string; tall?: boolean }) {
  return (
    <div style={{ textAlign: "left" }}>
      <p style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</p>
      <div
        style={{
          borderBottom: "1px solid #aaa",
          height: tall ? 52 : 24,
        }}
      />
    </div>
  )
}
