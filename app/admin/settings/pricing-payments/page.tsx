import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { readPricingPaymentSettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { PricingSettingsForm } from "@/components/settings/pricing-settings-form"
import { cn } from "@/lib/utils"

export default async function PricingPaymentsSettingsPage() {
  const [settings, t, tCommon] = await Promise.all([
    readPricingPaymentSettingsForAdmin(),
    getTranslations("pricingPaymentsPage"),
    getTranslations("common"),
  ])

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
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
        </div>
      </div>

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("batchingTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PricingSettingsForm initial={settings} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{tCommon("unauthorized")}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("modelsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("modelsBody")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
