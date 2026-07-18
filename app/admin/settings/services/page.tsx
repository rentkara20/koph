import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getServices } from "@/lib/actions/services"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { ServicesManager } from "./_components/services-manager"
import { cn } from "@/lib/utils"

export default async function ServicesPage() {
  const [services, t] = await Promise.all([getServices(), getTranslations("servicesPage")])

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t(services.length === 1 ? "serviceCount" : "serviceCountPlural", {
              count: services.length,
            })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("allServicesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ServicesManager services={services} />
        </CardContent>
      </Card>
    </div>
  )
}
