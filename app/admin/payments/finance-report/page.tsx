import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPaymentReview } from "@/lib/actions/payments"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FinancePackage, buildReviewExportHref } from "../_components/finance-package"

function asList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export default async function FinanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const selectedPartnerIds = asList(params.partnerId)
  const from = typeof params.from === "string" ? params.from : ""
  const to = typeof params.to === "string" ? params.to : ""
  const data = await getPaymentReview({ from, to, partnerIds: selectedPartnerIds })

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/admin/payments/review" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance report</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Email summary and Excel attachment for the selected partner payments.
          </p>
        </div>
      </div>

      <FinancePackage
        payments={data.payments}
        from={from}
        to={to}
        exportHref={buildReviewExportHref(from, to, selectedPartnerIds)}
      />
    </div>
  )
}
