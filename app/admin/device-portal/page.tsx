import { getTranslations } from "next-intl/server"
import { listDeviceServiceRequests } from "@/lib/actions/device-portal"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils/format"
import { ReviewButtons } from "./_components/review-buttons"

/**
 * Admin review queue for everything filed from the device stickers.
 *
 * A device-data correction reaches order_unit only through the Apply button
 * here — the portal itself never writes inventory, so someone who merely holds
 * a device cannot rewrite its record.
 */
export default async function DevicePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status = "submitted" } = await searchParams
  const [t, result] = await Promise.all([
    getTranslations("devicePortalAdmin"),
    listDeviceServiceRequests(status),
  ])

  if ("error" in result) {
    return <p className="text-sm text-destructive">{t("forbidden")}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex gap-2 text-sm">
        {(["submitted", "applied", "rejected"] as const).map((s) => (
          <a
            key={s}
            href={`/admin/device-portal?status=${s}`}
            className={
              status === s
                ? "rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                : "rounded-lg border px-3 py-1.5 text-muted-foreground"
            }
          >
            {t(`status.${s}` as "status.submitted")}
          </a>
        ))}
      </div>

      {result.rows.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-3">
          {result.rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold" dir="ltr">
                    {r.serialNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.kind} · {formatDate(r.createdAt)}
                  </p>
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
                  {t(`status.${r.status}` as "status.submitted")}
                </Badge>
              </div>

              <dl className="mt-3 grid gap-1.5 text-sm">
                {Object.entries(r.payload).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t(`field.${k}` as "field.note")}</dt>
                    <dd className="text-end font-medium">{String(v)}</dd>
                  </div>
                ))}
              </dl>

              {r.status === "submitted" && <ReviewButtons id={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
