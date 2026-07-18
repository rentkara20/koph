import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getWarrantyProducts } from "@/lib/actions/warranty"
import { readWarrantySettingsForAdmin } from "@/lib/actions/settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { WarrantyProductManager } from "./_components/warranty-product-manager"
import { WarrantyExpirySettings } from "./_components/warranty-expiry-settings"

export default async function WarrantySettingsPage() {
  const [products, warrantySettings, t] = await Promise.all([
    getWarrantyProducts(),
    readWarrantySettingsForAdmin(),
    getTranslations("warrantyConfigPage"),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/settings" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
        </div>
      </div>

      {warrantySettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("generalTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WarrantyExpirySettings expiryAlertDays={warrantySettings.expiryAlertDays} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("productsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WarrantyProductManager products={products} />
        </CardContent>
      </Card>
    </div>
  )
}
