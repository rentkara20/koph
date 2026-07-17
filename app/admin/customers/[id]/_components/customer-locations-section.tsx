"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Building2, ExternalLink, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { CustomerLocation } from "@/lib/db/schema"
import {
  createCustomerLocation,
  deleteCustomerLocation,
  setDefaultCustomerLocation,
  updateCustomerLocation,
  type CustomerLocationInput,
} from "@/lib/actions/customer-locations"
import { GooglePlacePicker, type PlaceSelection } from "@/components/google-place-picker"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Sheet } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

export function CustomerLocationForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: CustomerLocation | null
  pending: boolean
  onCancel: () => void
  onSubmit: (data: CustomerLocationInput) => void
}) {
  const t = useTranslations("customerSites")
  const [place, setPlace] = useState<PlaceSelection>({
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    mapsLink: initial?.mapsLink ?? "",
    googlePlaceId: initial?.googlePlaceId ?? "",
    latitude: initial?.latitude ?? null,
    longitude: initial?.longitude ?? null,
  })

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        onSubmit({
          name: String(formData.get("name") ?? ""),
          type: String(formData.get("type") ?? "office") as CustomerLocationInput["type"],
          city: place.city,
          address: place.address,
          mapsLink: place.mapsLink,
          googlePlaceId: place.googlePlaceId,
          latitude: place.latitude,
          longitude: place.longitude,
          workingHours: String(formData.get("workingHours") ?? ""),
          accessNotes: String(formData.get("accessNotes") ?? ""),
          isDefault: formData.get("isDefault") === "on",
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="customer-site-name">{t("name")} *</Label>
          <Input id="customer-site-name" name="name" required autoFocus defaultValue={initial?.name ?? ""} placeholder={t("namePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-site-type">{t("type")}</Label>
          <Select id="customer-site-type" name="type" defaultValue={initial?.type ?? "office"}>
            <option value="office">{t("types.office")}</option>
            <option value="warehouse">{t("types.warehouse")}</option>
            <option value="branch">{t("types.branch")}</option>
            <option value="project_site">{t("types.project_site")}</option>
            <option value="other">{t("types.other")}</option>
          </Select>
        </div>
      </div>

      <GooglePlacePicker
        value={place}
        onChange={setPlace}
        labels={{
          title: t("mapSearch"),
          hint: t("mapSearchHint"),
          unavailable: t("mapUnavailable"),
          currentLocation: t("useCurrentLocation"),
          openMap: t("openMap"),
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="customer-site-city">{t("city")}</Label>
          <Input id="customer-site-city" value={place.city} onChange={(event) => setPlace((current) => ({ ...current, city: event.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer-site-address">{t("address")}</Label>
          <Input id="customer-site-address" value={place.address} onChange={(event) => setPlace((current) => ({ ...current, address: event.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer-site-map">{t("mapsLink")}</Label>
          <Input id="customer-site-map" type="url" dir="ltr" value={place.mapsLink} onChange={(event) => setPlace((current) => ({ ...current, mapsLink: event.target.value }))} placeholder="https://maps.google.com/…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer-site-hours">{t("workingHours")}</Label>
          <Input id="customer-site-hours" name="workingHours" defaultValue={initial?.workingHours ?? ""} placeholder={t("workingHoursPlaceholder")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer-site-notes">{t("accessNotes")}</Label>
          <Textarea id="customer-site-notes" name="accessNotes" rows={2} defaultValue={initial?.accessNotes ?? ""} placeholder={t("accessNotesPlaceholder")} />
        </div>
      </div>

      {!initial && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" name="isDefault" className="size-4 rounded border-input" />
          {t("makeDefault")}
        </label>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel} disabled={pending}>{t("cancel")}</Button>
        <Button type="submit" className="h-11 flex-1" disabled={pending}>{pending ? t("saving") : t("save")}</Button>
      </div>
    </form>
  )
}

export function CustomerLocationsSection({
  customerId,
  initialLocations,
}: {
  customerId: string
  initialLocations: CustomerLocation[]
}) {
  const t = useTranslations("customerSites")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerLocation | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ error?: string }>, success: string, close = false) {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(success)
      if (close) setOpen(false)
      router.refresh()
    })
  }

  function save(data: CustomerLocationInput) {
    run(
      () => editing
        ? updateCustomerLocation(editing.id, customerId, data)
        : createCustomerLocation(customerId, data),
      editing ? t("updated") : t("created"),
      true
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="h-11" onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>

      {initialLocations.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-5 py-8 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">{t("empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {initialLocations.map((location) => (
            <div key={location.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-wrap-balance">{location.name}</p>
                    {location.isDefault && <Badge variant="success">{t("default")}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(`types.${location.type}`)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(location); setOpen(true) }} aria-label={t("edit")}><Pencil className="size-4" /></Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (confirm(t("deleteConfirm", { name: location.name }))) {
                        run(() => deleteCustomerLocation(customerId, location.id), t("deleted"))
                      }
                    }}
                    aria-label={t("delete")}
                  ><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              </div>
              {(location.city || location.address) && (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground text-pretty"><MapPin className="mt-0.5 size-4 shrink-0" />{[location.city, location.address].filter(Boolean).join(" · ")}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {location.mapsLink && (
                  <a href={location.mapsLink} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-10")}>
                    <ExternalLink className="size-4" />{t("openMap")}
                  </a>
                )}
                {!location.isDefault && (
                  <Button variant="outline" size="sm" className="min-h-10" disabled={pending} onClick={() => run(() => setDefaultCustomerLocation(customerId, location.id), t("defaultChanged"))}>
                    <Star className="size-3.5" />{t("setDefault")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} side="end" title={editing ? t("editTitle") : t("addTitle")} panelClassName="w-[36rem] max-w-full">
        <div className="h-full overflow-y-auto p-5 pt-14">
          <h2 className="text-lg font-semibold">{editing ? t("editTitle") : t("addTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("formHint")}</p>
          <CustomerLocationForm key={editing?.id ?? "new"} initial={editing} pending={pending} onCancel={() => setOpen(false)} onSubmit={save} />
        </div>
      </Sheet>
    </div>
  )
}
