import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ImportExportClient } from "./import-export-client"

type ModuleKey =
  | "asset"
  | "customer"
  | "order"
  | "supplier"
  | "partner"
  | "warrantyProduct"
  | "warrantyBatch"
  | "request"
  | "warrantyAssignment"
  | "productForSale"

const MODULE_KEYS: ModuleKey[] = [
  "asset",
  "customer",
  "order",
  "supplier",
  "partner",
  "warrantyProduct",
  "warrantyBatch",
  "request",
  "warrantyAssignment",
  "productForSale",
]

function resolveModule(value: string | undefined): ModuleKey {
  if (value && (MODULE_KEYS as string[]).includes(value)) return value as ModuleKey
  return "asset"
}

export default async function ImportExportPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>
}) {
  const { module } = await searchParams
  const t = await getTranslations("importExport")

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("pageSubtitle")}</p>
        </div>
      </div>

      <ImportExportClient initialModule={resolveModule(module)} />
    </div>
  )
}
