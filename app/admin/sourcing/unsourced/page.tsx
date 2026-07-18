import { getTranslations } from "next-intl/server"
import { getUnsourcedItems } from "@/lib/actions/sourcing-consolidated"
import { getSuppliers } from "@/lib/actions/suppliers"
import { UnsourcedItemsBoard } from "./_components/unsourced-items-board"

export default async function UnsourcedItemsPage() {
  const [t, items, suppliers] = await Promise.all([
    getTranslations("sourcing"),
    getUnsourcedItems(),
    getSuppliers(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("unsourced.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("unsourced.subtitle")}</p>
      </div>
      <UnsourcedItemsBoard items={items} suppliers={suppliers} />
    </div>
  )
}
