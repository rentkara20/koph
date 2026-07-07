import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowRight, QrCode } from "lucide-react"
import { getAsset } from "@/lib/actions/assets"
import { assetActionsFor, type AssetStatus } from "@/lib/domain/asset-status"
import { qrDataUrl } from "@/lib/utils/qr"
import { formatDate } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { ASSET_STATUS_VARIANT } from "../status-variant"
import { AssetActions } from "./_components/asset-actions"
import { OpenMaintenanceButton } from "./_components/open-maintenance-button"
import { AssetNoteForm } from "./_components/asset-note-form"

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, tCommon, data, locale] = await Promise.all([
    getTranslations("assets"),
    getTranslations("common"),
    getAsset(id),
    getLocale(),
  ])

  if (!data) notFound()
  const { asset, currentRequestNumber, events } = data

  const assetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://koph.vercel.app"}/admin/assets/${asset.id}`
  const qr = await qrDataUrl(assetUrl)

  const warrantyActive = asset.warrantyEnd != null && asset.warrantyEnd > Date.now()
  const money = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin/assets" className="hover:underline">
              {t("title")}
            </Link>
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            <span className="font-mono" dir="ltr">
              {asset.assetTag ?? asset.id.slice(0, 8)}
            </span>
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            {asset.description}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[asset.brand, asset.model].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Badge variant={ASSET_STATUS_VARIANT[asset.status] ?? "outline"} className="text-sm">
          {t(`statuses.${asset.status}`)}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AssetActions assetId={asset.id} actions={assetActionsFor(asset.status as AssetStatus)} />
        {["in_stock", "returned", "damaged"].includes(asset.status) && (
          <OpenMaintenanceButton assetId={asset.id} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Details card */}
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{t("details")}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("assetTag")}</dt>
              <dd className="font-mono font-semibold text-kara-purple" dir="ltr">
                {asset.assetTag ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("serial")}</dt>
              <dd className="font-mono" dir="ltr">{asset.serialNumber ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("location")}</dt>
              <dd>{asset.location}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("supplier")}</dt>
              <dd>{asset.supplierName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("order")}</dt>
              <dd>
                <Link
                  href={`/admin/orders/${asset.orderId}`}
                  className="font-mono text-xs hover:underline"
                  dir="ltr"
                >
                  {asset.orderNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("purchaseCost")}</dt>
              <dd>{asset.purchaseCost != null ? money.format(asset.purchaseCost) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("purchaseDate")}</dt>
              <dd>{asset.purchaseDate ? formatDate(asset.purchaseDate) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("warranty")}</dt>
              <dd className={warrantyActive ? "text-kara-blue font-medium" : "text-muted-foreground"}>
                {asset.warrantyEnd
                  ? warrantyActive
                    ? t("warrantyUntil", { date: formatDate(asset.warrantyEnd) })
                    : t("warrantyExpired")
                  : t("noWarranty")}
              </dd>
            </div>
            {asset.currentCustomerName && (
              <div>
                <dt className="text-xs text-muted-foreground">{t("customer")}</dt>
                <dd className="font-medium">{asset.currentCustomerName}</dd>
              </div>
            )}
            {currentRequestNumber && asset.currentRequestId && (
              <div>
                <dt className="text-xs text-muted-foreground">{tCommon("request")}</dt>
                <dd>
                  <Link
                    href={`/admin/requests/${asset.currentRequestId}`}
                    className="font-mono text-xs hover:underline"
                    dir="ltr"
                  >
                    {currentRequestNumber}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
          {asset.notes && (
            <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              {asset.notes}
            </p>
          )}
        </section>

        {/* QR card */}
        <section className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <QrCode className="size-4" aria-hidden />
            {t("qrHint")}
          </h2>
          {/* data-URL QR; next/image can't optimize data URIs */}
          <Image
            src={qr}
            alt={t("qrHint")}
            width={160}
            height={160}
            unoptimized
            className="rounded-lg border bg-white p-2"
          />
          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
            {asset.assetTag ?? asset.id.slice(0, 8)}
          </p>
        </section>
      </div>

      {/* Timeline */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{t("timeline")}</h2>
        <AssetNoteForm assetId={asset.id} />
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("noEvents")}</p>
        ) : (
          <ol className="mt-4 space-y-0">
            {events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Rail */}
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${
                      e.type === "status_change" ? "bg-kara-purple" : "bg-kara-blue"
                    }`}
                    aria-hidden
                  />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-border" aria-hidden />}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-sm">
                    <span className="font-medium">{t(`eventTypes.${e.type}`)}</span>
                    {e.fromStatus && e.toStatus && (
                      <span className="text-muted-foreground">
                        {" — "}
                        {t(`statuses.${e.toStatus}`)} ({t(`statuses.${e.fromStatus}`)})
                      </span>
                    )}
                  </p>
                  {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                  <p className="text-xs text-muted-foreground/70">{formatDate(e.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
