import { getTranslations } from "next-intl/server"
import { CreateAssetForm } from "../_components/create-asset-form"

export default async function NewAssetPage() {
  const t = await getTranslations("assets")

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("createAsset")}</h1>
      </div>
      <CreateAssetForm />
    </div>
  )
}
