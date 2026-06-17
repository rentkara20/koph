import { getTranslations } from "next-intl/server"

export default async function PartnerTasksPage() {
  const t = await getTranslations("tasks")
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tasks will appear here in Phase 4.
      </p>
    </div>
  )
}
