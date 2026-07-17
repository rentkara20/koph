import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getCompanyLocations } from "@/lib/actions/company-locations"
import { buttonVariants } from "@/components/ui/button"
import { CompanyLocationsManager } from "./_components/company-locations-manager"
import { cn } from "@/lib/utils"

export default async function CompanyLocationsPage() {
  const [locations, t] = await Promise.all([
    getCompanyLocations(),
    getTranslations("companyLocations"),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/settings" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{t("subtitle")}</p>
        </div>
      </div>

      <CompanyLocationsManager initialLocations={locations} />
    </div>
  )
}
