import type { DeliveryNoteData } from "@/lib/actions/delivery-notes"
import { formatDate } from "@/lib/utils/format"

const PURPLE = "#512A83"
const BLUE = "#60B5D1"
const GRAY_HEADER = "#BFBFBF"
const GRAY_ROW = "#D9D9D9"

function formatDeliveryDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return formatDate(ts)
}

const RentKaraLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 746.28 323.4"
    style={{ width: "28mm", height: "auto", display: "block" }}
    aria-label="Rent Kara"
  >
    <path fill="#512b83" d="M2.78,113.31a27.1,27.1,0,0,0,41.79,21.81L195.51,37.59a2.89,2.89,0,0,0,.19-4.71,160.38,160.38,0,0,0-194.57,0A2.87,2.87,0,0,0,0,35.31l.06,1.14Z"/>
    <path fill="#512b83" d="M2.78,210.09a27.1,27.1,0,0,1,41.79-21.81l150.94,97.53a2.89,2.89,0,0,1,.19,4.71,160.42,160.42,0,0,1-194.57,0A2.89,2.89,0,0,1,0,288.08l.06-1.14Z"/>
    <path fill="#60b5d0" d="M260.32,161.51c0-.72,0-1.45,0-2.17q0-3-.21-6a163.8,163.8,0,0,0-29.26-84.63,3.06,3.06,0,0,0-5-1.11q-45.52,27.2-91,54.54-18.95,11.4-37.94,22.72c-3.84,2.3-7.86,4.73-10.48,8.47A12.76,12.76,0,0,0,85.5,155a15.52,15.52,0,0,0-1.65,6.75h0v.11h0a15.52,15.52,0,0,0,1.65,6.75,12.76,12.76,0,0,0,.94,1.59c2.62,3.74,6.64,6.16,10.48,8.47q19,11.35,37.94,22.72,45.44,27.35,91,54.53a3,3,0,0,0,5-1.1,163.8,163.8,0,0,0,29.26-84.63q.17-3,.21-6c0-.72,0-1.45,0-2.17v-.49"/>
    <path fill="#1e2730" d="M383.78,144.76c1.24,2,1.53,3.67.89,5s-2.05,2-4.22,2H377a7.35,7.35,0,0,1-6.66-3.89l-25-42.72H323.28V146q0,5.84-5.5,5.84h-1.47c-3.72,0-5.57-1.95-5.57-5.84V66.69q0-11.91,5.34-17.34t18.2-5.43h10.38q20.29,0,30.44,6.93t10.15,23.63q0,13.53-6.66,20.59t-19.91,9.07Zm-60.5-77.17v25h22.54q14.42,0,20.61-4.25t6.19-13.94q0-9.69-6.15-13.87T345.82,56.4H334.28q-6.5,0-8.75,2.84t-2.25,8.35"/>
    <path fill="#1e2730" d="M451.5,151.81q-12.86,0-18.2-5.43T428,129V66.69q0-11.91,5.35-17.34t18.2-5.43h39.2c3.71,0,5.57,1.91,5.57,5.75v1c0,3.9-1.86,5.81-5.57,5.76H452.59q-7.21,0-9.65,2.76c-1.62,1.83-2.44,4.64-2.44,8.43v23.5h42.22q5.58,0,5.58,5.84v.89q0,5.84-5.58,5.84H440.5v24.48c0,3.78.82,6.58,2.44,8.39s4.84,2.71,9.65,2.71H494q5.58,0,5.58,5.84V146q0,5.84-5.58,5.84Z"/>
    <path fill="#1e2730" d="M546,151.81q-5.58,0-5.58-5.84V61.67q0-10.38,3.49-14.07t11.39-3.68A16.27,16.27,0,0,1,565.51,47q4,3.07,7.86,12.64L605.59,135a9.58,9.58,0,0,0,1.9,3.24,3,3,0,0,0,2.13.81q3,0,3-4.38V49.67q0-5.84,5.58-5.75h1.39c3.72,0,5.58,1.91,5.58,5.75v84.39q0,10.37-3.45,14.06t-11.35,3.69a16.51,16.51,0,0,1-10.3-3.08q-4-3.09-7.9-12.73l-32.3-75.22a10.59,10.59,0,0,0-1.78-3.25,2.89,2.89,0,0,0-2.17-.89q-3,0-3,4.46V146q0,5.84-5.5,5.84Z"/>
    <path fill="#1e2730" d="M740.7,43.92c3.72,0,5.58,1.91,5.58,5.75v1q0,5.84-5.58,5.76H710V146q0,5.84-5.58,5.84h-1.54q-5.58,0-5.58-5.84V56.4H666.66q-5.58,0-5.58-5.76v-1q0-5.84,5.58-5.75Z"/>
    <path fill="#1e2730" d="M381.68,287.81h-7.61c-4.52,0-8.25-1.25-10.24-4.15l-34.42-44.08v40.59c0,4.9-2.62,7.64-7.29,7.64h-7.78c-4.68,0-7.29-2.74-7.29-7.64V187.54c0-4.9,2.61-7.64,7.29-7.64h7.78c4.67,0,7.29,2.74,7.29,7.64v39.92l34.42-43.58c2-2.74,5.72-4,10.24-4h7.45c6.59,0,9.68,3.65,6.27,8.13l-36.65,45.49,36.73,46.15c3.25,4.4.39,8.14-6.19,8.14"/>
    <path fill="#1e2730" d="M491,281.33l-5.71-21.25H440.93l-5.72,21.25c-1.18,4.32-3.88,6.48-8.16,6.48h-8.17c-5.24,0-7.62-3.4-6.11-8.63l21-73.3c5.79-20.59,13.56-27.48,29.34-27.48s23.88,6.81,29.35,27.48l21,73.3c1.51,5.23-.87,8.63-6.11,8.63h-8.25c-4.28,0-7-2.16-8.17-6.48M471.3,207.87c-2.06-7.3-4-9.46-8.17-9.46s-6.1,2.16-8.17,9.46l-8.8,32.71H480Z"/>
    <path fill="#1e2730" d="M613.83,287.81H603.36c-4,0-6.74-1.74-8.56-5.48L575.52,243.4H560.77v36.77c0,4.9-2.62,7.64-7.3,7.64H545.7c-4.68,0-7.3-2.74-7.3-7.64V203.72c0-17.26,7.54-23.82,24.59-23.82h13.17c28.07,0,44.73,7.3,44.73,32.29,0,17.1-7.77,25.65-22.84,29.22l20.78,37.27c2.93,5.31.79,9.13-5,9.13m-35.21-62.59c15.14,0,19.9-4.32,19.9-13.2s-4.76-13-19.9-13H567.27c-5.47,0-6.5,3-6.5,6.89v19.34Z"/>
    <path fill="#1e2730" d="M722,281.33l-5.71-21.25H672l-5.72,21.25c-1.18,4.32-3.88,6.48-8.16,6.48h-8.17c-5.24,0-7.62-3.4-6.11-8.63l21-73.3c5.79-20.59,13.56-27.48,29.34-27.48s23.88,6.81,29.35,27.48l21,73.3c1.51,5.23-.87,8.63-6.11,8.63h-8.25c-4.28,0-7-2.16-8.17-6.48m-19.67-73.46c-2.06-7.3-4-9.46-8.17-9.46s-6.1,2.16-8.17,9.46l-8.8,32.71h33.87Z"/>
  </svg>
)

export function DeliveryNoteView({ data }: { data: DeliveryNoteData }) {
  const { request, customer, items, signature } = data
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
  const quoteNum = request?.quoteNumber ?? ""
  const docRef = [
    quoteNum ? `DN#${quoteNum}` : null,
    customer?.name ?? null,
  ].filter(Boolean).join(" ")

  return (
    <div
      id="delivery-note-root"
      style={{
        width: "297mm",
        height: "210mm",
        position: "relative",
        background: "#ffffff",
        overflow: "hidden",
        fontFamily: 'Arial, Helvetica, "Tahoma", sans-serif',
        color: "#222",
        fontSize: "7.5pt",
      }}
    >
      {/* ── Top header strip ── */}
      <div style={{
        position: "absolute", top: "4mm", left: "4mm",
        width: "289mm", height: "16mm", background: GRAY_HEADER,
      }} />
      <div style={{
        position: "absolute", top: "4mm", right: "4mm",
        width: "160mm", height: "16mm", background: PURPLE,
        clipPath: "polygon(16% 0, 100% 0, 100% 100%, 0% 100%)",
      }} />
      <div style={{ position: "absolute", top: "6mm", left: "9mm" }}>
        <RentKaraLogo />
      </div>

      {/* ── Title ── */}
      <div style={{
        position: "absolute", top: "23mm", left: "13mm", right: "13mm",
        height: "10mm", borderBottom: `0.7mm solid ${PURPLE}`,
      }}>
        <span style={{
          position: "absolute", left: 0, bottom: "1.5mm",
          fontSize: "16pt", fontWeight: 700, color: PURPLE,
        }}>Delivery Note</span>
        <span style={{
          position: "absolute", right: 0, bottom: "1.5mm",
          fontSize: "14pt", fontWeight: 700, color: PURPLE, direction: "rtl",
        }}>سند تسليم</span>
      </div>

      {/* ── Details table ── */}
      <table style={{
        position: "absolute", top: "35mm", left: "56mm",
        width: "185mm", borderCollapse: "collapse", fontSize: "7.5pt",
      }}>
        <colgroup>
          <col style={{ width: "35mm" }} />
          <col style={{ width: "60mm" }} />
          <col style={{ width: "45mm" }} />
          <col style={{ width: "45mm" }} />
        </colgroup>
        <tbody>
          {[
            { en: "Quote Number",    ar: "رقم الطلب",          val: quoteNum || "—", gray: true },
            { en: "Delivery Date",   ar: "تاريخ التسليم",      val: formatDeliveryDate(request?.deliveryDate), gray: false },
            { en: "Prepared For",    ar: "تم اعداده لصالح",    val: customer?.name ?? "—", gray: true },
            { en: "Point of Contact",ar: "مسؤول التواصل",      val: customer?.contactPerson ?? "—", gray: false },
            { en: "Phone Number",    ar: "رقم الجوال",          val: customer?.mobile ?? "—", gray: true },
            { en: "E-mail",          ar: "البريد الإلكتروني",  val: customer?.email ?? "—", gray: false },
          ].map(({ en, ar, val, gray }) => (
            <tr key={en} style={{ background: gray ? GRAY_ROW : "#fff" }}>
              <td style={{ padding: "0 3mm", height: "4.6mm", verticalAlign: "middle", fontWeight: 700 }}>{en}</td>
              <td style={{ padding: "0 3mm", height: "4.6mm", verticalAlign: "middle", fontWeight: 700, textAlign: "center" }}>{val}</td>
              <td style={{ width: "45mm" }} />
              <td style={{ padding: "0 3mm", height: "4.6mm", verticalAlign: "middle", fontWeight: 700, textAlign: "right", direction: "rtl" }}>{ar}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Divider ── */}
      <div style={{
        position: "absolute", top: "66mm", left: "56mm",
        width: "185mm", borderTop: "0.3mm solid #777",
      }} />

      {/* ── Devices section ── */}
      <div style={{ position: "absolute", top: "69mm", left: "23mm", width: "251mm" }}>

        {/* Blue header bar */}
        <div style={{
          height: "5mm", background: BLUE, color: "#fff",
          fontWeight: 700, fontSize: "9pt",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 4mm",
        }}>
          <span>Devices Information</span>
          <span dir="rtl">معلومات الأجهزة</span>
        </div>

        {/* Devices table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt" }}>
          <colgroup>
            <col style={{ width: "27%" }} />
            <col style={{ width: "66%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ background: GRAY_ROW, color: "#111", fontWeight: 700, height: "7mm", padding: "0 2mm", borderRight: `0.2mm solid ${GRAY_HEADER}`, textAlign: "left", verticalAlign: "middle" }}>
                <div>Serial Number</div>
                <div style={{ direction: "rtl", fontSize: "6.5pt", fontWeight: 500 }}>الرقم التسلسلي</div>
              </th>
              <th style={{ background: GRAY_ROW, color: "#111", fontWeight: 700, height: "7mm", padding: "0 2mm", borderRight: `0.2mm solid ${GRAY_HEADER}`, textAlign: "left", verticalAlign: "middle" }}>
                <div>Device Specs</div>
                <div style={{ direction: "rtl", fontSize: "6.5pt", fontWeight: 500 }}>وصف الجهاز</div>
              </th>
              <th style={{ background: GRAY_ROW, color: "#111", fontWeight: 700, height: "7mm", padding: "0 2mm", textAlign: "center", verticalAlign: "middle" }}>
                <div>QTY</div>
                <div style={{ direction: "rtl", fontSize: "6.5pt", fontWeight: 500 }}>الكمية</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "0 2mm", height: "5mm", textAlign: "center", color: "#999" }}>No items</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} style={{ borderBottom: "0.2mm solid #D0D0D0" }}>
                  <td style={{ padding: "0 2mm", height: "5mm", verticalAlign: "middle", fontFamily: "monospace" }}>
                    {item.serialNumber ?? "—"}
                  </td>
                  <td style={{ padding: "0 2mm", height: "5mm", verticalAlign: "middle" }}>
                    {item.description}
                    {(item.brand || item.model) && ` — ${[item.brand, item.model].filter(Boolean).join(" ")}`}
                  </td>
                  <td style={{ padding: "0 2mm", height: "5mm", verticalAlign: "middle", textAlign: "center", fontWeight: 700 }}>
                    {item.quantity}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Total row */}
        <div style={{
          height: "8mm", borderTop: "0.4mm solid #999", borderBottom: "0.4mm solid #999",
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          fontSize: "8.5pt", fontWeight: 700, color: PURPLE, paddingRight: "8mm", gap: "3mm",
        }}>
          <span>Total Qty:</span>
          <strong>{totalQty}</strong>
        </div>
      </div>

      {/* ── Confirmation ── */}
      <div style={{
        position: "absolute", top: "103mm", left: "23mm", width: "251mm",
        textAlign: "center", color: PURPLE, fontWeight: 700,
      }}>
        <div style={{ fontSize: "8.5pt", marginBottom: "1mm" }}>
          I confirm that I have inspected the devices and items, verified the quantities, and received them in good condition
        </div>
        <div style={{ fontSize: "7pt", direction: "rtl" }}>
          أقر بأنني قمت بفحص الأجهزة والمنتجات والتحقق من الكميات، واستلمتها بحالة جيدة.
        </div>
      </div>

      {/* ── Signature box ── */}
      <div style={{
        position: "absolute", top: "116mm", left: "88mm",
        width: "121mm", height: "52mm",
        border: "0.3mm solid #999",
      }}>
        {/* Header */}
        <div style={{
          height: "9mm", background: GRAY_ROW, textAlign: "center",
          fontWeight: 700, fontSize: "8pt",
          display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
          lineHeight: 1.3,
        }}>
          <div>Signature of the Receiver</div>
          <div dir="rtl" style={{ fontSize: "7pt", fontWeight: 600 }}>توقيع المستلم</div>
        </div>

        {/* Fields */}
        <div style={{ padding: "1mm 7mm 0", fontSize: "7.5pt" }}>
          {signature ? (
            /* Signed — show real data */
            <>
              <SigFieldFilled labelEn="Name"      labelAr="الاسم"       value={signature.fullName} />
              <SigFieldFilled labelEn="ID Number" labelAr="رقم الهوية"  value={signature.nationalId ?? "—"} />
              <SigFieldFilled labelEn="Date"      labelAr="التاريخ"     value={formatDate(signature.signedAt)} />
              <div style={{ marginTop: "2mm" }}>
                <div style={{ fontSize: "7pt", color: "#555", marginBottom: "1mm" }}>
                  Signature &nbsp;/&nbsp; <span dir="rtl">التوقيع</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signature.signatureData}
                  alt="Signature"
                  style={{ maxWidth: "80mm", maxHeight: "14mm", border: "0.2mm solid #ddd", padding: "1mm", background: "#fff" }}
                />
              </div>
            </>
          ) : (
            /* Blank — lines for manual signing */
            <>
              <SigRow labelEn="Name"      labelAr="الاسم" />
              <SigRow labelEn="ID Number" labelAr="رقم الهوية" />
              <SigRow labelEn="Date"      labelAr="التاريخ" />
              <SigRow labelEn="Signature" labelAr="التوقيع" tall />
            </>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: "absolute", bottom: "16mm", left: "23mm", width: "251mm",
        textAlign: "center", color: PURPLE, fontWeight: 700,
      }}>
        <div style={{ fontSize: "8.5pt" }}>
          Kindly sign and return the Delivery Note to complete the delivery process
        </div>
        <div style={{ fontSize: "7pt", direction: "rtl", marginTop: "1mm" }}>
          نأمل التكرم بالتوقيع وإعادة إرسال سند التسليم لاستكمال إجراءات التسليم
        </div>
      </div>

      {/* ── Doc ref ── */}
      <div style={{
        position: "absolute", bottom: "10mm", right: "18mm",
        fontSize: "5pt", color: "#333",
      }}>
        {docRef}
      </div>
    </div>
  )
}

function SigRow({ labelEn, labelAr, tall }: { labelEn: string; labelAr: string; tall?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "25mm 58mm 25mm",
      alignItems: "flex-end", height: tall ? "16mm" : "9mm",
    }}>
      <span style={{ fontSize: "7pt" }}>{labelEn}</span>
      <div style={{ borderBottom: "0.3mm solid #555", height: "1mm" }} />
      <span style={{ direction: "rtl", textAlign: "right", fontSize: "7pt" }}>{labelAr}</span>
    </div>
  )
}

function SigFieldFilled({ labelEn, labelAr, value }: { labelEn: string; labelAr: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "25mm 1fr 25mm", alignItems: "center", height: "9mm" }}>
      <span style={{ fontSize: "7pt", color: "#555" }}>{labelEn}</span>
      <span style={{ fontWeight: 700, fontSize: "7.5pt", textAlign: "center" }}>{value}</span>
      <span style={{ direction: "rtl", textAlign: "right", fontSize: "7pt", color: "#555" }}>{labelAr}</span>
    </div>
  )
}
