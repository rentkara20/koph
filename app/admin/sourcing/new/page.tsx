import { getTranslations } from "next-intl/server"
import { CreateSourcingRequestForm } from "../_components/create-sourcing-request-form"

export default async function NewSourcingRequestPage() {
  const t = await getTranslations("sourcing")

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("newRequest")}</h1>
      <CreateSourcingRequestForm />
    </div>
  )
}
