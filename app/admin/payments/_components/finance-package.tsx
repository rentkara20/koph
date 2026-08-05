import { formatDate } from "@/lib/utils/format"
import { ExportCsvButton, ReportActions } from "../finance-report/_components/report-actions"

type PaymentLine = {
  id: string
  partnerName: string | null
  serviceType: string | null
  serviceDescription: string
  serialNumber: string
  deviceSpecs: string
  quoteNumber: string | null
  totalAmount: number
  status: string
  notes: string | null
  createdAt: number
}

function monthLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    timeZone: "Asia/Riyadh",
    month: "short",
    year: "numeric",
  })
}

type SummaryRow = {
  month: string
  partner: string
  service: string
  count: number
  total: number
}

function buildEmailRows(payments: PaymentLine[]): SummaryRow[] {
  const rows = new Map<string, SummaryRow>()
  for (const payment of payments) {
    const month = monthLabel(payment.createdAt)
    const partner = payment.partnerName ?? "-"
    const service = payment.serviceType ?? "Service"
    const key = `${month}|${partner}|${service}`
    const existing = rows.get(key) ?? { month, partner, service, count: 0, total: 0 }
    existing.count += 1
    existing.total += payment.totalAmount
    rows.set(key, existing)
  }
  return [...rows.values()]
}

function buildExportRows(payments: PaymentLine[]) {
  return payments.map((payment) => ({
    "التاريخ": formatDate(payment.createdAt),
    "نوع الخدمه": payment.serviceType ?? "",
    "وصف الخدمه": payment.serviceDescription || "",
    "الرقم التسلسلي": payment.serialNumber,
    "مواصفات الجهاز": payment.deviceSpecs,
    "Client Quote": payment.quoteNumber ?? "",
    "الجهه المنفذه": payment.partnerName ?? "",
    "سعر الخدمه": payment.totalAmount.toFixed(2),
    "Paied": payment.status === "paid" ? "Yes" : "No",
    "Notes": payment.notes ?? "",
  }))
}

export function FinancePackage({
  payments,
  from,
  to,
}: {
  payments: PaymentLine[]
  from: string
  to: string
}) {
  const sortedPayments = [...payments].sort((a, b) => a.createdAt - b.createdAt)
  const emailRows = buildEmailRows(sortedPayments)
  const exportRows = buildExportRows(sortedPayments)
  const totalAmount = sortedPayments.reduce((sum, payment) => sum + payment.totalAmount, 0)

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Finance package</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Use this for the email body, and download the detailed Excel CSV attachment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsvButton filename={`partner-payments-${from || "all"}-${to || "all"}.csv`} rows={exportRows} />
          <ReportActions />
        </div>
      </div>

      <div id="finance-report" className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-muted/40 p-3">
          <div>
            <p className="text-sm font-medium">Partner services payment sheet</p>
            <p className="text-xs text-muted-foreground">
              Period: {from || "Start"} to {to || "Today"}
            </p>
          </div>
          <div className="text-end">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-semibold tabular-nums">{totalAmount.toFixed(2)} SAR</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y bg-[#5b2b83] text-white">
                <th className="p-2 text-start font-medium">الشهر</th>
                <th className="p-2 text-start font-medium">الجهه المنفذه</th>
                <th className="p-2 text-start font-medium">الخدمات</th>
                <th className="p-2 text-end font-medium">عدد الخدمات</th>
                <th className="p-2 text-end font-medium">السعر الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {emailRows.map((row) => (
                <tr key={`${row.month}-${row.partner}-${row.service}`} className="border-b">
                  <td className="p-2 whitespace-nowrap">{row.month}</td>
                  <td className="p-2 font-medium">{row.partner}</td>
                  <td className="p-2">{row.service}</td>
                  <td className="p-2 text-end tabular-nums">{row.count}</td>
                  <td className="p-2 text-end font-semibold tabular-nums">{row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2">
                <td className="p-2 font-semibold" colSpan={3}>Total</td>
                <td className="p-2 text-end font-semibold tabular-nums">{sortedPayments.length}</td>
                <td className="p-2 text-end font-semibold tabular-nums">{totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  )
}
