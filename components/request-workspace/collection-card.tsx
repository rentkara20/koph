import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, PackageOpen, Truck } from "lucide-react"
import type { CollectionReadiness } from "@/lib/domain/collection-readiness"
import { buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

// Standing "bring the devices back" card. Unlike the scheduleCollection next
// action, this is not gated on a rental-end date — an order whose rental months
// were never filled in still has to be collectable. Rendered wherever the
// devices themselves are on screen.
export async function CollectionCard({
  orderNumber,
  readiness,
  rentalEndAt,
  openCollectionHref,
}: {
  orderNumber: string
  readiness: CollectionReadiness
  rentalEndAt: number | null
  /** Where to send the user when a collection is already running. */
  openCollectionHref?: string | null
}) {
  if (readiness.state === "unavailable") return null

  const t = await getTranslations("workspace.collection")

  if (readiness.state === "in_progress") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/40">
        <div className="flex min-w-0 items-start gap-2.5">
          <Truck className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-sky-900 dark:text-sky-100">{t("runningTitle")}</p>
            <p className="text-xs text-sky-700 dark:text-sky-300">
              {t("runningBody", { count: readiness.outCount })}
            </p>
          </div>
        </div>
        {openCollectionHref && (
          <Link
            href={openCollectionHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            {t("openJob")}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <PackageOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("title", { count: readiness.outCount })}</p>
          <p className="text-xs text-muted-foreground">
            {rentalEndAt ? t("endsOn", { date: formatDate(rentalEndAt) }) : t("noEndDate")}
          </p>
        </div>
      </div>
      <Link
        href={`/admin/requests/new?orderNumber=${encodeURIComponent(orderNumber)}&type=collection`}
        className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
      >
        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
        {t("start")}
      </Link>
    </div>
  )
}
