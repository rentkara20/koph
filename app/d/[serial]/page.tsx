import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getDevicePublicView } from "@/lib/actions/device-portal"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { formatDate } from "@/lib/utils/format"
import { ActivateForm } from "./_components/activate-form"

/**
 * Public device page — the destination of the printed sticker QR.
 *
 * The URL (/d/<serial>) is printed on physical hardware and therefore
 * permanent. Everything that may change lives in this page, never in the code
 * of the sticker.
 *
 * No customer, order, or price is exposed here: a stranger who picks the
 * device up learns what the device is and that it is in service, nothing more.
 */
export default async function DevicePage({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params
  const [device, t] = await Promise.all([
    getDevicePublicView(serial),
    getTranslations("devicePortal"),
  ])

  if (!device) notFound()

  const specs = [device.brand, device.model, device.deviceType].filter(Boolean).join(" · ")

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center justify-between border-b bg-kara-purple px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-primary-foreground">{t("title")}</p>
          <p className="font-mono text-xs text-primary-foreground/85" dir="ltr">
            {device.serial}
          </p>
        </div>
        <LocaleToggle />
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-5">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("serial")}</p>
              <p className="font-mono text-lg font-bold tracking-wide" dir="ltr">
                {device.serial}
              </p>
            </div>
            <Badge variant={device.inService ? "default" : "outline"}>
              {device.inService ? t("inService") : t("retired")}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("specs")}</dt>
              <dd className="text-end font-medium">
                {specs || <span className="text-muted-foreground">{t("noSpecs")}</span>}
              </dd>
            </div>
            {device.assetTag && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("assetTag")}</dt>
                <dd className="font-mono text-end" dir="ltr">
                  {device.assetTag}
                </dd>
              </div>
            )}
            {device.warrantyEnd && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("warrantyEnd")}</dt>
                <dd className="text-end">{formatDate(device.warrantyEnd)}</dd>
              </div>
            )}
          </dl>
        </section>

        {device.activated ? (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{t("activated")}</p>
              <Badge variant="secondary">✓</Badge>
            </div>

            {device.holder && (
              <dl className="mt-3 grid gap-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("holder")}</dt>
                  <dd className="font-medium">{device.holder.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("email")}</dt>
                  <dd dir="ltr">{device.holder.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("mobile")}</dt>
                  <dd dir="ltr">{device.holder.mobile}</dd>
                </div>
              </dl>
            )}

            {!device.isHolder && (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                {t("maskedNotice")}
              </p>
            )}

            <Link
              href={`/d/${encodeURIComponent(device.serial)}/services`}
              className={cn(buttonVariants(), "mt-4 w-full")}
            >
              {t("goToServices")}
            </Link>

            {!device.isHolder && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t("notMyDevice")}
                </summary>
                <div className="mt-3">
                  <ActivateForm serial={device.serial} transfer />
                </div>
              </details>
            )}
          </section>
        ) : (
          <ActivateForm serial={device.serial} />
        )}
      </main>
    </div>
  )
}
