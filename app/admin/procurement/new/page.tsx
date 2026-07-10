import { getTranslations } from "next-intl/server"
import { getSuppliers } from "@/lib/actions/suppliers"
import { CreatePoForm } from "../_components/create-po-form"

export default async function NewPurchaseOrderPage() {
  const [t, suppliers] = await Promise.all([getTranslations("procurement"), getSuppliers()])

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("createPo")}</h1>
      <CreatePoForm suppliers={suppliers} />
    </div>
  )
}
