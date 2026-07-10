import { getTranslations } from "next-intl/server"
import { getAccessoryItems, getAccessoryStock, getAccessoryUnits } from "@/lib/actions/accessories"
import { AccessoriesManager } from "./_components/accessories-manager"

export default async function AccessoriesPage() {
  const [t, items, stock, units] = await Promise.all([
    getTranslations("accessories"),
    getAccessoryItems(),
    getAccessoryStock(),
    getAccessoryUnits(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <AccessoriesManager items={items} stock={stock} units={units} />
    </div>
  )
}
