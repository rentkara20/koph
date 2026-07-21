import type { DeliveryNoteData } from "@/lib/actions/delivery-notes"
import { formatDate } from "@/lib/utils/format"
import { extractDeliveryLocationLabel } from "@/lib/utils/city-iata"
import { computeDepositTotal, DEPOSIT_REFUND_TERMS_EN, DEPOSIT_REFUND_TERMS_AR } from "@/lib/domain/deposit-note"

function fmt(ts: number | null | undefined): string {
  return ts ? formatDate(ts) : "—"
}

function fmtAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function cleanNote(value: string | null | undefined): string | null {
  const note = value?.trim()
  return note ? note : null
}

// Split a bilingual "English · عربي" title (either order) into a Latin run and
// an Arabic run so the header can place English left + Arabic right — matching
// the rest of the note — instead of rendering one mixed-bidi line. Returns null
// for a single-language title.
function splitBilingualTitle(value: string): { en: string; ar: string } | null {
  const parts = value.split("·").map((p) => p.trim())
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const isArabic = (s: string) => /[؀-ۿ]/.test(s)
  const [a, b] = parts
  if (isArabic(a) && !isArabic(b)) return { en: b, ar: a }
  if (isArabic(b) && !isArabic(a)) return { en: a, ar: b }
  return null
}

const RentKaraLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 746.28 323.4"
    style={{ width: "26mm", height: "auto", display: "block" }}
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

const CONDITION_LABEL: Record<string, string> = {
  good: "Good / سليم",
  damaged: "Damaged / تالف",
  missing: "Missing / مفقود",
}
const CONDITION_COLOR: Record<string, string> = {
  good: "#2e7d32",
  damaged: "#b45309",
  missing: "#c62828",
}

function SignatureBox({
  titleEn,
  titleAr,
  name,
  nationalId,
  date,
  signatureData,
}: {
  titleEn: string
  titleAr: string
  name: string | null
  nationalId: string | null
  date: string
  signatureData: string | null
}) {
  return (
    <div className="dn-sig-box">
      <div className="dn-sig-hdr">
        <span className="dn-sig-hdr-en">{titleEn}</span>
        <span className="dn-sig-hdr-ar">{titleAr}</span>
      </div>
      <div className="dn-sig-body">
        <div className="dn-sf">
          <span className="dn-sfl-en">Name</span>
          <span className="dn-sfv">{name ?? ""}</span>
          <span className="dn-sfl-ar">الاسم</span>
        </div>
        <div className="dn-sf">
          <span className="dn-sfl-en">ID Number</span>
          <span className="dn-sfv">{nationalId ?? ""}</span>
          <span className="dn-sfl-ar">رقم الهوية</span>
        </div>
        <div className="dn-sf">
          <span className="dn-sfl-en">Date</span>
          <span className="dn-sfv">{date}</span>
          <span className="dn-sfl-ar">التاريخ</span>
        </div>
        <div className="dn-sf">
          <span className="dn-sfl-en">Signature</span>
          <span className="dn-sfv" />
          <span className="dn-sfl-ar">التوقيع</span>
        </div>
        {signatureData ? (
          <div className="dn-sig-img-wrap">
            <img className="dn-sig-img" src={signatureData} alt="Signature" />
          </div>
        ) : (
          // Unsigned: leave a blank space so the customer can sign by hand /
          // online — no "awaiting" placeholder text on the document itself.
          <div className="dn-sig-blank" />
        )}
      </div>
    </div>
  )
}

export function DeliveryNoteView({ data }: { data: DeliveryNoteData }) {
  const { sig, request, customer, items, signature, authorized, requiresAuthorized, authorizedName, depositNote } = data
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  // Only render the deposit block when opted in AND it carries content.
  const depositLines = depositNote?.lines ?? []
  const depositNoteText = cleanNote(depositNote?.note)
  const showDeposit = Boolean(depositNote?.enabled && (depositLines.length > 0 || depositNoteText))
  const depositTotal = computeDepositTotal(depositLines)
  const depositTitleParts = depositNote ? splitBilingualTitle(depositNote.title) : null
  const signDate = fmt(signature?.signedAt ?? request?.deliveryDate ?? null)
  // Print the delivery location ("<IATA>, P<n>") taken from the document name,
  // falling back to the customer's registered city for legacy notes.
  const deliveryLocation = extractDeliveryLocationLabel(sig?.documentName) ?? customer?.city ?? "—"

  return (
    <div className="dn-root" id="delivery-note-root">
      <style>{DN_STYLES}</style>

      {/* Header */}
      <div className="dn-hdr">
        <div className="dn-hdr-logo"><RentKaraLogo /></div>
        <div className="dn-hdr-purple2" />
        <div className="dn-hdr-purple" />
      </div>

      <div className="dn-body">
        {/* Title */}
        <div className="dn-title-row">
          <div className="dn-title">Delivery Note</div>
          <div className="dn-title-divider" />
          <div className="dn-title dn-rtl">سند تسليم</div>
        </div>

        {/* Info table — company / customer data */}
        <div className="dn-info-wrap">
          <table className="dn-info-tbl">
            <tbody>
              <tr className="dn-sec-hdr"><td colSpan={3}>Order Information &nbsp;/&nbsp; بيانات الطلب</td></tr>
              <tr><td className="dn-en-lbl">Quote Number</td><td className="dn-val dn-fw">{request?.quoteNumber ?? "—"}</td><td className="dn-ar-lbl">رقم الطلب</td></tr>
              <tr><td className="dn-en-lbl">Delivery Date</td><td className="dn-val">{fmt(request?.deliveryDate)}</td><td className="dn-ar-lbl">تاريخ التسليم</td></tr>
              <tr className="dn-sec-hdr"><td colSpan={3}>Client Information &nbsp;/&nbsp; بيانات العميل</td></tr>
              <tr><td className="dn-en-lbl">Prepared For</td><td className="dn-val dn-fw">{customer?.name ?? "—"}</td><td className="dn-ar-lbl">تم إعداده لصالح</td></tr>
              <tr><td className="dn-en-lbl">Point of Contact</td><td className="dn-val">{customer?.contactPerson ?? "—"}</td><td className="dn-ar-lbl">مسؤول التواصل</td></tr>
              <tr><td className="dn-en-lbl">Phone Number</td><td className="dn-val">{customer?.mobile ?? "—"}</td><td className="dn-ar-lbl">رقم الجوال</td></tr>
              <tr><td className="dn-en-lbl">E-mail</td><td className="dn-val">{customer?.email ?? "—"}</td><td className="dn-ar-lbl">البريد الإلكتروني</td></tr>
              <tr><td className="dn-en-lbl">City</td><td className="dn-val">{deliveryLocation}</td><td className="dn-ar-lbl">المدينة</td></tr>
            </tbody>
          </table>
        </div>

        {/* Devices band */}
        <div className="dn-dev-band">Devices Information &nbsp;:&nbsp; معلومات الأجهزة</div>

        {/* Devices table */}
        <table className="dn-dev-tbl">
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "48%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "28%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Serial Number<span className="dn-th-ar">الرقم التسلسلي</span></th>
              <th className="dn-thw">Device Specs<span className="dn-th-ar">مواصفات الجهاز</span></th>
              <th>Qty<span className="dn-th-ar">الكمية</span></th>
              <th>Condition<span className="dn-th-ar">الحالة</span></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "#999" }}>No items</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: "monospace" }}>{item.serialNumber ?? "—"}</td>
                  <td className="dn-thw">
                    {item.description}
                    {(item.brand || item.model) && ` — ${[item.brand, item.model].filter(Boolean).join(" ")}`}
                  </td>
                  <td>{item.quantity}</td>
                  <td style={{ color: item.condition ? CONDITION_COLOR[item.condition] : "#1A1A1A", fontWeight: 700 }}>
                    {item.condition ? CONDITION_LABEL[item.condition] : "—"}
                  </td>
                </tr>
              ))
            )}
            <tr className="dn-tot-row">
              <td colSpan={2} style={{ textAlign: "right", paddingRight: "12px" }}>Total Items &nbsp;/&nbsp; إجمالي الأصناف</td>
              <td>{totalQty}</td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* Financial security deposit (opt-in) */}
        {showDeposit && depositNote && (
          <div className="dn-dep-box">
            {depositTitleParts ? (
              <div className="dn-dep-hdr dn-dep-hdr-split">
                <span>{depositTitleParts.en}</span>
                <span className="dn-rtl">{depositTitleParts.ar}</span>
              </div>
            ) : (
              <div className="dn-dep-hdr">{depositNote.title}</div>
            )}
            {depositLines.length > 0 && (
              <table className="dn-dep-tbl">
                <colgroup>
                  <col style={{ width: "72%" }} />
                  <col style={{ width: "28%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Device / الجهاز</th>
                    <th className="dn-dep-amt-th">Amount / المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {depositLines.map((line) => (
                    <tr key={line.itemId}>
                      <td className="dn-dep-label">{line.label}</td>
                      <td className="dn-dep-amt">
                        {fmtAmount(line.amount)} {depositNote.currency}
                      </td>
                    </tr>
                  ))}
                  {depositNote.showTotal && (
                    <tr className="dn-dep-tot">
                      <td style={{ textAlign: "right", paddingRight: "12px" }}>
                        Total Deposit &nbsp;/&nbsp; إجمالي التأمين
                      </td>
                      <td className="dn-dep-amt">
                        {fmtAmount(depositTotal)} {depositNote.currency}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {depositNote.showRefundTerms && (
              <div className="dn-dep-terms">
                <span>{DEPOSIT_REFUND_TERMS_EN}</span>
                <span className="dn-rtl">{DEPOSIT_REFUND_TERMS_AR}</span>
              </div>
            )}
            {depositNoteText && <div className="dn-dep-note">{depositNoteText}</div>}
          </div>
        )}

        {/* Disclaimer */}
        <div className="dn-disclaimer">
          I confirm that I have inspected the devices and items, verified the quantities, and received them in good condition.
          <span className="dn-disclaimer-ar">أقر بأنني قد قمت بفحص الأجهزة والأصناف والتحقق من الكميات واستلمتها بحالة جيدة.</span>
        </div>

        {/* Signatures */}
        <div className="dn-sig-wrap">
          <SignatureBox
            titleEn="Signature of the Receiver"
            titleAr="توقيع المستلم"
            name={signature?.fullName ?? null}
            nationalId={signature?.nationalId ?? null}
            date={signDate}
            signatureData={signature?.signatureData ?? null}
          />
          {requiresAuthorized && (
            <SignatureBox
              titleEn="Authorised Signatory"
              titleAr="المفوّض بالتوقيع"
              name={authorized?.fullName ?? authorizedName ?? null}
              nationalId={authorized?.nationalId ?? null}
              date={authorized ? fmt(authorized.signedAt) : "—"}
              signatureData={authorized?.signatureData ?? null}
            />
          )}
        </div>

        {/* Footer */}
        <div className="dn-footer">
          Thank you for choosing Kara. We appreciate your trust and look forward to serving you again.
          <br />
          شكراً لاختياركم كارا، نقدر ثقتكم ونتطلع لخدمتكم مرة أخرى
        </div>
      </div>
    </div>
  )
}

const DN_STYLES = `
.dn-root{width:210mm;margin:0 auto;background:#fff;color:#1A1A1A;font-family:'Cairo','Bahij','Geeza Pro',Arial,sans-serif;font-size:11px;direction:ltr;}
.dn-rtl{direction:rtl;}
.dn-hdr{position:relative;background:#d4d0d0;overflow:hidden;display:flex;align-items:center;padding:9px 22px;min-height:60px;}
.dn-hdr-logo{z-index:2;position:relative;flex-shrink:0;}
.dn-hdr-purple{position:absolute;right:-18px;top:-8px;bottom:-8px;width:200px;background:#512B83;transform:skewX(-12deg);z-index:1;}
.dn-hdr-purple2{position:absolute;right:44px;top:-8px;bottom:-8px;width:40px;background:#6a3fa0;transform:skewX(-12deg);z-index:1;opacity:.5;}
.dn-body{padding:10px 24px 18px;}
.dn-title-row{display:flex;justify-content:center;align-items:center;gap:18px;margin-bottom:8px;}
.dn-title{font-size:20px;font-weight:700;color:#512B83;}
.dn-title-divider{width:1px;height:20px;background:#512B83;opacity:.35;}
.dn-info-wrap{display:flex;justify-content:center;margin-bottom:8px;}
.dn-info-tbl{width:82%;border-collapse:collapse;font-size:11px;}
.dn-info-tbl td{padding:3px 14px;border:none;vertical-align:middle;}
.dn-sec-hdr td{background:#e8e4f0;color:#512B83;font-weight:700;text-align:center;font-size:11px;}
.dn-en-lbl{color:#555;text-align:left;width:30%;}
.dn-val{color:#1A1A1A;text-align:center;font-weight:500;width:40%;}
.dn-fw{font-weight:700;color:#512B83;}
.dn-ar-lbl{color:#555;text-align:right;direction:rtl;width:30%;}
.dn-info-tbl tr:last-child td{border-bottom:1.5px solid #1A1A1A;}
.dn-dev-band{background:#60B5D1;color:#fff;text-align:center;padding:5px 12px;font-weight:700;font-size:12px;}
.dn-dev-tbl{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px;table-layout:fixed;}
.dn-dev-tbl th{background:#512B83;color:#fff;padding:6px;border:1px solid #3d1f63;text-align:center;font-weight:600;}
.dn-th-ar{display:block;font-size:8px;font-weight:400;opacity:.85;margin-top:2px;direction:rtl;}
.dn-thw{text-align:left;padding-left:8px;}
.dn-dev-tbl td{padding:5px 6px;border:1px solid #e0dcea;text-align:center;vertical-align:middle;word-break:break-word;}
.dn-tot-row td{background:#512B83;color:#fff;font-weight:700;}
.dn-dep-box{border:1px solid #e0dcea;border-radius:6px;margin:0 0 12px;overflow:hidden;}
.dn-dep-hdr{background:#efecf7;color:#512B83;padding:6px 14px;font-weight:700;font-size:10.5px;text-align:center;border-bottom:1px solid #e0dcea;}
.dn-dep-hdr-split{display:flex;justify-content:space-between;align-items:center;text-align:left;}
.dn-dep-tbl{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;}
.dn-dep-tbl th{background:#efecf7;color:#512B83;padding:4px 12px;border:1px solid #e0dcea;text-align:left;font-weight:700;font-size:9px;letter-spacing:.02em;}
.dn-dep-amt-th{text-align:right;}
.dn-dep-tbl td{padding:5px 12px;border:1px solid #e0dcea;vertical-align:middle;word-break:break-word;}
.dn-dep-label{padding-left:12px;}
.dn-dep-amt{text-align:right;padding-right:12px;font-weight:600;white-space:nowrap;}
.dn-dep-tot td{background:#e2dcf0;color:#512B83;font-weight:700;}
.dn-dep-terms{padding:7px 14px;font-size:9.5px;color:#3d3350;line-height:1.7;border-top:1px solid #e0dcea;background:#faf9fd;}
.dn-dep-terms span{display:block;}
.dn-dep-note{padding:8px 12px;font-size:9.5px;color:#666;font-style:italic;line-height:1.7;border-top:1px dotted #e8e4f0;white-space:pre-wrap;word-break:break-word;}
.dn-disclaimer{font-size:10px;color:#512B83;text-align:center;margin:12px 0 14px;line-height:1.8;font-style:italic;}
.dn-disclaimer-ar{display:block;direction:rtl;margin-top:4px;}
.dn-sig-wrap{display:flex;gap:14px;margin-bottom:14px;}
.dn-sig-box{flex:1;border:1px solid #ccc;border-radius:6px;overflow:hidden;}
.dn-sig-hdr{background:#e8e4f0;color:#512B83;padding:7px 12px;font-weight:700;font-size:10.5px;border-bottom:1px solid #d4cfe4;display:flex;justify-content:space-between;align-items:center;}
.dn-sig-hdr-ar{direction:rtl;}
.dn-sig-body{padding:10px 12px;}
.dn-sf{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;padding:5px 0;border-bottom:1px dotted #e8e4f0;}
.dn-sf:last-child{border:none;}
.dn-sfl-en{color:#838383;font-size:10px;text-align:left;}
.dn-sfl-ar{color:#838383;font-size:10px;text-align:right;direction:rtl;}
.dn-sfv{font-weight:600;font-size:11px;color:#1A1A1A;text-align:center;}
.dn-sig-img-wrap{margin-top:8px;padding-top:6px;border-top:1px solid #e0dcea;text-align:center;}
.dn-sig-img{display:inline-block;width:auto;height:auto;max-width:100%;max-height:70px;object-fit:contain;}
.dn-sig-blank{margin-top:8px;min-height:80px;border-top:1px dashed #e0dcea;}
.dn-footer{text-align:center;padding:10px 16px 12px;border-top:2px solid #60B5D1;font-size:10px;color:#512B83;font-weight:700;line-height:1.8;}
@media print{@page{margin:8mm;size:A4;}.dn-root{width:100%;}}
`
