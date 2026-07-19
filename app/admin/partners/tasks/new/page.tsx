import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getPartnersWithContracts } from "@/lib/actions/tasks"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { NewAdHocTaskForm } from "./_components/new-ad-hoc-task-form"

// Admin-only creation of an ad-hoc partner task — an operational trip with no
// customer request or purchase order behind it.
export default async function NewAdHocTaskPage() {
  const [partners, t] = await Promise.all([
    getPartnersWithContracts(),
    getTranslations("tasks"),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/partners" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("adHocNewTitle")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adHocNewSubtitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <NewAdHocTaskForm
            partners={partners.map((p) => ({
              id: p.id,
              name: p.name,
              contracts: p.contracts.map((c) => ({ id: c.contractId as string, name: c.contractName as string })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
