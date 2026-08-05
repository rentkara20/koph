import Link from "next/link"
import { ArrowLeft, CalendarDays, CheckCircle2, FileText, PencilLine, Search, Send } from "lucide-react"
import { getPaymentReview } from "@/lib/actions/payments"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import { FinancePackage } from "../_components/finance-package"
import { PaymentLineEditor } from "./_components/payment-line-editor"

const LINE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  batched: "Batched",
  paid: "Paid",
  on_hold: "On hold",
}

const LINE_STATUS_VARIANT: Record<string, "outline" | "info" | "success" | "warning"> = {
  pending: "info",
  batched: "outline",
  paid: "success",
  on_hold: "warning",
}

function asList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getPresetRanges() {
  const now = new Date()
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const thisMonthEnd = new Date(nextMonthStart.getTime() - 1)
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1)

  return {
    lastMonth: { from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
    thisMonth: { from: ymd(thisMonthStart), to: ymd(thisMonthEnd) },
  }
}

export default async function PaymentReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const selectedPartnerIds = asList(params.partnerId)
  const from = typeof params.from === "string" ? params.from : ""
  const to = typeof params.to === "string" ? params.to : ""
  const tab = params.tab === "send" || params.tab === "paid" ? params.tab : "prepare"
  const data = await getPaymentReview({ from, to, partnerIds: selectedPartnerIds })
  const reportParams = new URLSearchParams()
  if (from) reportParams.set("from", from)
  if (to) reportParams.set("to", to)
  for (const partnerId of selectedPartnerIds) reportParams.append("partnerId", partnerId)
  const reportHref = `/admin/payments/finance-report${reportParams.toString() ? `?${reportParams}` : ""}`
  const tabHref = (nextTab: "prepare" | "send" | "paid") => {
    const next = new URLSearchParams(reportParams)
    if (nextTab !== "prepare") next.set("tab", nextTab)
    return `/admin/payments/review${next.toString() ? `?${next}` : ""}`
  }
  const presets = getPresetRanges()
  const selectedAll = selectedPartnerIds.length === 0
  const paymentsByPartner = new Map<string, typeof data.payments>()
  for (const payment of data.payments) {
    const key = payment.partnerId
    paymentsByPartner.set(key, [...(paymentsByPartner.get(key) ?? []), payment])
  }
  const totals = data.summary.reduce(
    (acc, row) => ({
      paymentCount: acc.paymentCount + row.paymentCount,
      pendingTotal: acc.pendingTotal + row.pendingTotal,
      batchedTotal: acc.batchedTotal + row.batchedTotal,
      paidTotal: acc.paidTotal + row.paidTotal,
      heldTotal: acc.heldTotal + row.heldTotal,
      totalAmount: acc.totalAmount + row.totalAmount,
    }),
    {
      paymentCount: 0,
      pendingTotal: 0,
      batchedTotal: 0,
      paidTotal: 0,
      heldTotal: 0,
      totalAmount: 0,
    }
  )

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/payments" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Partner Accounting</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Prepare the sheet, send it to finance, then mark paid after confirmation.
            </p>
          </div>
        </div>
        <Link href={reportHref} className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
          <FileText className="size-3.5" />
          Finance report
        </Link>
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-2 sm:grid-cols-3">
        <Link
          href={tabHref("prepare")}
          className={cn(
            buttonVariants({ variant: tab === "prepare" ? "default" : "ghost", size: "sm" }),
            "justify-start"
          )}
        >
          <PencilLine className="size-3.5" />
          1. Prepare
        </Link>
        <Link
          href={tabHref("send")}
          className={cn(
            buttonVariants({ variant: tab === "send" ? "default" : "ghost", size: "sm" }),
            "justify-start"
          )}
        >
          <Send className="size-3.5" />
          2. Send to finance
        </Link>
        <Link
          href={tabHref("paid")}
          className={cn(
            buttonVariants({ variant: tab === "paid" ? "default" : "ghost", size: "sm" }),
            "justify-start"
          )}
        >
          <CheckCircle2 className="size-3.5" />
          3. Mark paid
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card size="sm" className="lg:col-span-2">
          <CardContent>
            <p className="text-xs text-muted-foreground">Scope</p>
            <p className="mt-1 text-base font-semibold">
              {from || to ? `${from || "Start"} to ${to || "Today"}` : "All available dates"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedAll ? "All partners" : `${selectedPartnerIds.length} selected partner${selectedPartnerIds.length === 1 ? "" : "s"}`}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">Ready to batch</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{totals.pendingTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">Disputed / held</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{totals.heldTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">Grand total</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{totals.totalAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/payments/review?from=${presets.lastMonth.from}&to=${presets.lastMonth.to}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <CalendarDays className="size-3.5" />
                Last month
              </Link>
              <Link
                href={`/admin/payments/review?from=${presets.thisMonth.from}&to=${presets.thisMonth.to}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <CalendarDays className="size-3.5" />
                This month
              </Link>
              <Link href="/admin/payments/review" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                All dates and partners
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">From</span>
                <Input type="date" name="from" defaultValue={from} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">To</span>
                <Input type="date" name="to" defaultValue={to} />
              </label>
              <div className="space-y-1.5 lg:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Partners</p>
                <div className="grid max-h-36 gap-2 overflow-auto rounded-lg border p-3 sm:grid-cols-2">
                  {data.partners.map((partner) => (
                    <label key={partner.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="partnerId"
                        value={partner.id}
                        defaultChecked={selectedAll || selectedPartnerIds.includes(partner.id)}
                        className="size-4 rounded border-input"
                      />
                      <span className="min-w-0 truncate">{partner.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Keep all checked for a full run, or uncheck anyone you do not want in this review.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <Button type="submit">
                <Search className="size-3.5" />
                Apply filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {tab === "prepare" && <Card>
        <CardHeader>
          <CardTitle>Totals by partner</CardTitle>
        </CardHeader>
        <CardContent>
          {data.summary.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No partner payments match these filters.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.summary.map((row) => {
                const lines = paymentsByPartner.get(row.partnerId) ?? []
                return (
                  <section key={row.partnerId} className="rounded-lg border">
                    <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4">
                      <div>
                        <h2 className="font-semibold">{row.partnerName ?? "—"}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.paymentCount} payment line{row.paymentCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-semibold tabular-nums">{row.totalAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Pending</p>
                        <p className="font-medium tabular-nums">{row.pendingTotal.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Batched</p>
                        <p className="font-medium tabular-nums">{row.batchedTotal.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <p className="font-medium tabular-nums">{row.paidTotal.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Held</p>
                        <p className="font-medium tabular-nums">{row.heldTotal.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="divide-y border-t">
                      {lines.slice(0, 5).map((payment) => (
                        <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs">{payment.requestNumber ?? "—"}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {payment.customerName ?? "No customer"} · {formatDate(payment.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={LINE_STATUS_VARIANT[payment.status] ?? "outline"}>
                              {LINE_STATUS_LABEL[payment.status] ?? payment.status}
                            </Badge>
                            <span className="w-20 text-end font-semibold tabular-nums">{payment.totalAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                      {lines.length > 5 && (
                        <p className="px-4 py-2 text-xs text-muted-foreground">
                          {lines.length - 5} more line{lines.length - 5 === 1 ? "" : "s"} in the detailed table below.
                        </p>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>}

      {tab === "send" && <FinancePackage payments={data.payments} from={from} to={to} />}

      {tab === "prepare" && <Card>
        <CardHeader>
          <CardTitle>Operations to adjust</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Partner</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Request</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Service / amount / notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(payment.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{payment.partnerName ?? "—"}</td>
                  <td className="px-4 py-3">
                    {payment.requestId ? (
                      <Link href={`/admin/requests/${payment.requestId}`} className="font-mono hover:text-primary">
                        {payment.requestNumber ?? payment.requestId}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{payment.customerName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={LINE_STATUS_VARIANT[payment.status] ?? "outline"}>
                      {LINE_STATUS_LABEL[payment.status] ?? payment.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <PaymentLineEditor
                      paymentId={payment.id}
                      amount={payment.totalAmount}
                      notes={payment.notes}
                      status={payment.status}
                      serviceType={payment.serviceType}
                      serviceDescription={payment.serviceDescription}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>}

      {tab === "paid" && (
        <Card>
          <CardHeader>
            <CardTitle>Mark paid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              After finance confirms payment, open or create the payment batch for each partner and mark it paid.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.summary.map((row) => (
                <div key={row.partnerId} className="rounded-lg border p-4">
                  <p className="font-medium">{row.partnerName ?? "—"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pending: {row.pendingTotal.toFixed(2)} · Batched: {row.batchedTotal.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">{row.totalAmount.toFixed(2)} SAR</p>
                </div>
              ))}
            </div>
            <Link href="/admin/payments" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              Open payment batches
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
