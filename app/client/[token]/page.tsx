import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getClientPortalData } from "@/lib/actions/client-portal"
import { Badge } from "@/components/ui/badge"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { formatDate } from "@/lib/utils/format"
import { CallbackForm } from "./_components/callback-form"

const REQUEST_STATUS_VARIANT: Record<string, "outline" | "info" | "success" | "secondary" | "warning"> = {
  draft: "outline",
  confirmed: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "secondary",
  on_hold: "secondary",
}

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [data, t, tReq, tAsset] = await Promise.all([
    getClientPortalData(token),
    getTranslations("clientPortal"),
    getTranslations("requests.status"),
    getTranslations("assets.statuses"),
  ])

  if (!data) notFound()

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center justify-between border-b bg-kara-purple px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-primary-foreground">{t("title")}</p>
          <p className="text-xs text-primary-foreground/85">{data.customer.name}</p>
        </div>
        <LocaleToggle />
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t("requests")}</h2>
          </header>
          {data.requests.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noRequests")}</p>
          ) : (
            <ul className="divide-y">
              {data.requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {r.requestNumber}
                    </p>
                    {r.deliveryDate && (
                      <p className="text-xs text-muted-foreground">{formatDate(r.deliveryDate)}</p>
                    )}
                  </div>
                  <Badge variant={REQUEST_STATUS_VARIANT[r.status] ?? "outline"}>
                    {tReq(r.status as Parameters<typeof tReq>[0])}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t("assets")}</h2>
          </header>
          {data.assets.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noAssets")}</p>
          ) : (
            <ul className="divide-y">
              {data.assets.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-mono text-xs font-semibold text-kara-purple" dir="ltr">
                    {a.assetTag ?? a.serialNumber ?? "—"}
                  </span>
                  <Badge variant="outline">{tAsset(a.status as Parameters<typeof tAsset>[0])}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <CallbackForm token={token} requestOptions={data.requests.map((r) => ({ id: r.id, label: r.requestNumber }))} />
      </main>
    </div>
  )
}
