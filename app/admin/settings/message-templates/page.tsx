import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getTranslations } from "next-intl/server"
import {
  readOperationalMessageTemplatesForAdmin,
  readRfqMessageTemplatesForAdmin,
  readWarrantyRequestTemplatesForAdmin,
} from "@/lib/actions/settings"
import { MessageTemplateSettingsForm } from "@/components/settings/message-template-settings-form"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default async function MessageTemplatesSettingsPage() {
  const [t, rfqTemplates, operationalTemplates, warrantyRequestTemplates] = await Promise.all([
    getTranslations("messageTemplates"),
    readRfqMessageTemplatesForAdmin(),
    readOperationalMessageTemplatesForAdmin(),
    readWarrantyRequestTemplatesForAdmin(),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/admin/settings" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {rfqTemplates && operationalTemplates && warrantyRequestTemplates ? (
        <MessageTemplateSettingsForm
          rfqInitial={rfqTemplates}
          operationalInitial={operationalTemplates}
          warrantyRequestInitial={warrantyRequestTemplates}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("unauthorized")}</p>
      )}
    </div>
  )
}
