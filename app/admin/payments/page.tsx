import Link from "next/link"
import { getPaymentBatches, getPartnersWithPendingPayments } from "@/lib/actions/payments"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"
import { GenerateBatchForm } from "./_components/generate-batch-form"

const STATUS_VARIANT: Record<string, "outline" | "info" | "warning" | "success"> = {
  draft: "outline",
  approved: "info",
  sent_to_finance: "warning",
  paid: "success",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  sent_to_finance: "Sent to Finance",
  paid: "Paid",
}

export default async function PaymentsPage() {
  const [batches, pending] = await Promise.all([
    getPaymentBatches(),
    getPartnersWithPendingPayments(),
  ])

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payment batches</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {batches.length} batch{batches.length !== 1 ? "es" : ""}
            {pending.length > 0 && ` · ${pending.length} partner period${pending.length !== 1 ? "s" : ""} with pending payments`}
          </p>
        </div>
        <GenerateBatchForm pending={pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">All batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No batches yet. Generate the first one from pending payments.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Partner</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Period</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Payments</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Amount (SAR)</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((batch) => (
                  <tr key={batch.id} className="relative hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/payments/${batch.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {batch.partnerName ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono">{batch.period}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {batch.paymentCount}
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {batch.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[batch.status] ?? "outline"}>
                        {STATUS_LABEL[batch.status] ?? batch.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {formatDate(batch.generatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
