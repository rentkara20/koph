import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { readPricingPaymentSettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { PricingSettingsForm } from "@/components/settings/pricing-settings-form"
import { cn } from "@/lib/utils"

export default async function PricingPaymentsSettingsPage() {
  const settings = await readPricingPaymentSettingsForAdmin()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing & Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Business-month rules for partner payment batching.
          </p>
        </div>
      </div>

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payment batching
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PricingSettingsForm initial={settings} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Unauthorized.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Contract pricing models
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pricing models (per order, per item, per day, per hour, fixed) are defined in code
            because each one drives a distinct payment calculation formula. Adding a new model
            requires a code change — this is intentional so a bad settings value can never
            silently miscalculate a partner payment. Contact engineering to add a new pricing
            model.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
