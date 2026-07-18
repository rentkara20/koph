import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default async function RolesSettingsPage() {
  const t = await getTranslations("rolesPage")

  const CAPABILITIES = [
    { area: t("areaCore"), admin: true, finance: false, viewer: t("readOnly") as string | false },
    { area: t("areaPayments"), admin: true, finance: true, viewer: t("readOnly") as string | false },
    { area: t("areaSettings"), admin: true, finance: false, viewer: false as string | false },
    { area: t("areaSignOff"), admin: true, finance: true, viewer: false as string | false },
  ]

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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("matrixTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y rounded-lg border text-sm">
            {CAPABILITIES.map((row) => {
              const viewer: string = row.viewer === false ? "✗" : row.viewer
              return (
                <div key={row.area} className="grid grid-cols-[1fr_auto] items-center gap-3 p-3">
                  <span>{row.area}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("adminLabel")}: {row.admin ? "✓" : "✗"} · {t("financeLabel")}:{" "}
                    {row.finance ? "✓" : "✗"} · {t("viewerLabel")}: {viewer}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.rich("body", {
              code1: (chunks) => <code>{chunks}</code>,
              code2: (chunks) => <code>{chunks}</code>,
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
