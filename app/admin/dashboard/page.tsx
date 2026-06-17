import { getTranslations } from "next-intl/server"

export default async function DashboardPage() {
  const t = await getTranslations("nav")

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t("dashboard")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        KOPH is ready. Modules will appear here as they are built.
      </p>
    </div>
  )
}
