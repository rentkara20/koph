import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getDeviceServicesView } from "@/lib/actions/device-portal"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { formatDate } from "@/lib/utils/format"
import { ServiceList } from "./_components/service-list"

/**
 * Second page of the device portal: the requestable-action list.
 *
 * The list itself is data (app_setting → device_portal_services), so the set
 * of services — and a stocktake mode that swaps what employees are asked —
 * changes from the admin without touching this page or reprinting a sticker.
 */
export default async function DeviceServicesPage({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params
  const [view, t] = await Promise.all([
    getDeviceServicesView(serial),
    getTranslations("devicePortal"),
  ])

  if (!view) notFound()

  const specs = [view.brand, view.model, view.deviceType].filter(Boolean).join(" · ")

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center justify-between border-b bg-kara-purple px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary-foreground">{t("servicesTitle")}</p>
          <p className="truncate font-mono text-xs text-primary-foreground/85" dir="ltr">
            {view.serial}
            {specs ? ` · ${specs}` : ""}
          </p>
        </div>
        <LocaleToggle />
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-5">
        {!view.isHolder ? (
          <section className="rounded-xl border bg-card p-4 text-center">
            <p className="text-sm font-semibold">{t("holderOnly")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("holderOnlyHint")}</p>
            <Link
              href={`/d/${encodeURIComponent(view.serial)}`}
              className={cn(buttonVariants({ variant: "outline" }), "mt-4 w-full")}
            >
              {t("backToDevice")}
            </Link>
          </section>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t("greeting", { name: view.holderName ?? "" })}
            </p>
            <ServiceList serial={view.serial} services={view.services} />
          </>
        )}

        {view.requests.length > 0 && (
          <section className="rounded-xl border bg-card">
            <header className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{t("myRequests")}</h2>
            </header>
            <ul className="divide-y">
              {view.requests.map((r) => {
                const label = view.services.find((s) => s.key === r.kind)
                return (
                  <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label?.labelAr ?? r.kind}</p>
                      {typeof r.payload.note === "string" && (
                        <p className="truncate text-xs text-muted-foreground">
                          {r.payload.note}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                    </div>
                    <Badge
                      variant={
                        r.status === "applied"
                          ? "default"
                          : r.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {t(`requestStatus.${r.status}` as "requestStatus.submitted")}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <Link
          href={`/d/${encodeURIComponent(view.serial)}`}
          className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
        >
          {t("backToDevice")}
        </Link>
      </main>
    </div>
  )
}
