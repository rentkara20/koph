"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowDown, ExternalLink, MapPin, Pencil, Phone, RotateCcw, Warehouse } from "lucide-react"
import { toast } from "sonner"
import { setRequestLogistics } from "@/lib/actions/requests"
import { buildRequestRoutePlan, type RequestRoutePoint } from "@/lib/domain/request-route"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"
import { formatDate } from "@/lib/utils/format"
import { parseTimeWindow } from "@/lib/domain/time-window"

type PartyLocation = {
  id?: string
  name: string
  role?: string | null
  mobile?: string | null
  city?: string | null
  address?: string | null
  mapsLink?: string | null
}

type Props = {
  requestId: string
  requestTypeSlug: string | null
  origin: string | null
  destination: string | null
  plannedDate: number | null
  timeWindow: string | null
  warehouse: {
    companyName: string
    name: string
    contactName: string | null
    contactMobile: string | null
    city: string | null
    address: string | null
    mapsLink: string | null
    workingHours: string | null
    accessNotes: string | null
  } | null
  customer: PartyLocation | null
  contact: PartyLocation | null
  customerLocation: PartyLocation | null
}

function RoutePointCard({
  eyebrow,
  point,
  warehouse,
  openMapLabel,
}: {
  eyebrow: string
  point: RequestRoutePoint
  warehouse: boolean
  openMapLabel: string
}) {
  const Icon = warehouse ? Warehouse : MapPin
  return (
    <div className="min-w-0 flex-1 rounded-xl border bg-background p-3.5">
      <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
      <div className="mt-2 flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-wrap-pretty">{point.label}</p>
          {point.contactName && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{point.contactName}</p>}
          {point.address && <p className="mt-0.5 text-xs text-muted-foreground text-wrap-pretty">{point.address}</p>}
          {point.workingHours && <p className="mt-0.5 text-xs text-muted-foreground">{point.workingHours}</p>}
          {point.accessNotes && <p className="mt-1.5 text-xs text-muted-foreground text-wrap-pretty">{point.accessNotes}</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            {point.mobile && (
              <a href={`tel:${point.mobile}`} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-primary">
                <Phone className="size-3.5" />
                {point.mobile}
              </a>
            )}
            {point.mapsLink && (
              <a href={point.mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-primary">
                <ExternalLink className="size-3.5" />
                {openMapLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LogisticsSection({
  requestId,
  requestTypeSlug,
  origin,
  destination,
  plannedDate,
  timeWindow,
  warehouse,
  customer,
  contact,
  customerLocation,
}: Props) {
  const t = useTranslations("requests")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingRoute, setEditingRoute] = useState(false)
  const [originValue, setOriginValue] = useState(origin ?? "")
  const [destinationValue, setDestinationValue] = useState(destination ?? "")
  const parsedTimeWindow = parseTimeWindow(timeWindow)

  const endpoint = customerLocation ?? contact ?? customer
  const endpointLabel = endpoint
    ? [endpoint.name, endpoint.role, endpoint.city].filter(Boolean).join(" · ")
    : t("routeContactMissingLabel")
  const contactPoint: RequestRoutePoint = {
    label: endpointLabel,
    address: endpoint?.address,
    mapsLink: endpoint?.mapsLink,
    mobile: contact?.mobile ?? endpoint?.mobile,
    contactName: customerLocation ? contact?.name : null,
  }
  const warehousePoint: RequestRoutePoint = warehouse ? {
    label: `${warehouse.companyName} — ${warehouse.name}`,
    address: [warehouse.city, warehouse.address].filter(Boolean).join(" · ") || null,
    mapsLink: warehouse.mapsLink,
    mobile: warehouse.contactMobile,
    contactName: warehouse.contactName,
    workingHours: warehouse.workingHours,
    accessNotes: warehouse.accessNotes,
  } : { label: t("karaWarehouse") }
  const route = buildRequestRoutePlan({
    typeSlug: requestTypeSlug,
    warehouse: warehousePoint,
    contact: contactPoint,
    originOverride: originValue,
    destinationOverride: destinationValue,
  })
  const contactNeedsDetails = Boolean(contact && (
    !contact.mobile || (!customerLocation?.address && !customerLocation?.mapsLink && !contact.address && !contact.mapsLink)
  ))

  function save() {
    startTransition(async () => {
      try {
        const result = await setRequestLogistics(requestId, {
          origin: originValue,
          destination: destinationValue,
        })
        if (result.error) {
          toast.error(translateActionError(result.error))
          return
        }
        toast.success(tToast("logisticsSaved"))
        setEditingRoute(false)
        router.refresh()
      } catch {
        toast.error(tToast("genericError"))
      }
    })
  }

  function resetAutomaticRoute() {
    setOriginValue("")
    setDestinationValue("")
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-muted/20 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{t("routeSummary")}</p>
            <p className="text-xs text-muted-foreground">
              {route.isAutomatic ? t("automaticRouteHint") : t("manualRouteHint")}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditingRoute((value) => !value)}>
            <Pencil className="size-3.5" />
            {t("editRoute")}
          </Button>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <RoutePointCard eyebrow={t("routeFrom")} point={route.from} warehouse={route.from.label === warehousePoint.label} openMapLabel={t("openMap")} />
          <ArrowDown className="mx-auto size-5 shrink-0 text-muted-foreground sm:-rotate-90" />
          <RoutePointCard eyebrow={t("routeTo")} point={route.to} warehouse={route.to.label === warehousePoint.label} openMapLabel={t("openMap")} />
        </div>

        {route.returnTo && (
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
            {t("swapReturnHint", { destination: route.returnTo.label })}
          </p>
        )}
      </div>

      {!contact && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t(requestTypeSlug === "collection" ? "selectPickupContactHint" : "selectDeliveryContactHint")}
        </p>
      )}
      {contactNeedsDetails && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("completeContactRouteHint")}
        </p>
      )}
      {!warehouse && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("companyLocationMissingHint")}{" "}
          <Link href="/admin/settings/company-locations" className="font-semibold underline underline-offset-4">
            {t("addCompanyLocation")}
          </Link>
        </p>
      )}

      {editingRoute && (
        <div className="space-y-3 rounded-xl border border-dashed p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("exceptionalRoute")}</p>
              <p className="text-xs text-muted-foreground">{t("exceptionalRouteHint")}</p>
            </div>
            {!route.isAutomatic && (
              <Button type="button" variant="ghost" size="sm" onClick={resetAutomaticRoute}>
                <RotateCcw className="size-3.5" />
                {t("resetAutomaticRoute")}
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="origin">{t("routeFrom")}</Label>
              <Input id="origin" value={originValue} onChange={(e) => setOriginValue(e.target.value)} disabled={pending} placeholder={route.from.label} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destination">{t("routeTo")}</Label>
              <Input id="destination" value={destinationValue} onChange={(e) => setDestinationValue(e.target.value)} disabled={pending} placeholder={route.to.label} />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("executionPlan")}</p>
        <p className="mt-1 text-sm font-semibold">
          {plannedDate ? formatDate(plannedDate) : t("notSet")}
          {timeWindow ? ` · ${parsedTimeWindow ? `${parsedTimeWindow.start}–${parsedTimeWindow.end}` : timeWindow}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("executionPlanHint")}</p>
      </div>
      {editingRoute && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? t("savingRoute") : t("saveRoute")}
          </Button>
        </div>
      )}
    </div>
  )
}
