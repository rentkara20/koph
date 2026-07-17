"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Building2, ExternalLink, MapPin, Pencil, Phone, Plus, Star, Trash2, UserRound } from "lucide-react"
import { toast } from "sonner"
import {
  createCompanyLocation,
  deleteCompanyLocation,
  setDefaultCompanyLocation,
  updateCompanyLocation,
  type CompanyLocation,
  type CompanyLocationInput,
} from "@/lib/actions/company-locations"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Sheet } from "@/components/ui/sheet"

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "")
}

function LocationForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: CompanyLocation | null
  pending: boolean
  onCancel: () => void
  onSubmit: (data: CompanyLocationInput) => void
}) {
  const t = useTranslations("companyLocations")

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        onSubmit({
          companyName: field(formData, "companyName"),
          name: field(formData, "name"),
          type: field(formData, "type") as CompanyLocationInput["type"],
          contactName: field(formData, "contactName"),
          contactMobile: field(formData, "contactMobile"),
          city: field(formData, "city"),
          address: field(formData, "address"),
          mapsLink: field(formData, "mapsLink"),
          workingHours: field(formData, "workingHours"),
          accessNotes: field(formData, "accessNotes"),
          isDefault: formData.get("isDefault") === "on",
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="location-company">{t("companyName")} *</Label>
          <Input id="location-company" name="companyName" required defaultValue={initial?.companyName ?? "KARA"} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location-name">{t("locationName")} *</Label>
          <Input id="location-name" name="name" required defaultValue={initial?.name ?? ""} placeholder={t("locationNamePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location-type">{t("type")}</Label>
          <Select id="location-type" name="type" defaultValue={initial?.type ?? "warehouse"}>
            <option value="warehouse">{t("types.warehouse")}</option>
            <option value="office">{t("types.office")}</option>
            <option value="service_center">{t("types.service_center")}</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location-city">{t("city")}</Label>
          <Input id="location-city" name="city" defaultValue={initial?.city ?? ""} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="location-address">{t("address")}</Label>
          <Input id="location-address" name="address" defaultValue={initial?.address ?? ""} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="location-map">{t("mapsLink")}</Label>
          <Input id="location-map" name="mapsLink" type="url" dir="ltr" defaultValue={initial?.mapsLink ?? ""} placeholder="https://maps.google.com/…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location-contact">{t("contactName")}</Label>
          <Input id="location-contact" name="contactName" defaultValue={initial?.contactName ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location-mobile">{t("contactMobile")}</Label>
          <Input id="location-mobile" name="contactMobile" type="tel" dir="ltr" defaultValue={initial?.contactMobile ?? ""} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="location-hours">{t("workingHours")}</Label>
          <Input id="location-hours" name="workingHours" defaultValue={initial?.workingHours ?? ""} placeholder={t("workingHoursPlaceholder")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="location-notes">{t("accessNotes")}</Label>
          <Textarea id="location-notes" name="accessNotes" rows={2} defaultValue={initial?.accessNotes ?? ""} placeholder={t("accessNotesPlaceholder")} />
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

export function CompanyLocationsManager({ initialLocations }: { initialLocations: CompanyLocation[] }) {
  const t = useTranslations("companyLocations")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyLocation | null>(null)
  const [pending, startTransition] = useTransition()

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(location: CompanyLocation) {
    setEditing(location)
    setOpen(true)
  }

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

  function save(data: CompanyLocationInput) {
    run(
      () => editing
        ? updateCompanyLocation(editing.id, data)
        : createCompanyLocation(data),
      editing ? t("updated") : t("created"),
      true
    )
  }

  function remove(location: CompanyLocation) {
    if (!confirm(t("deleteConfirm", { name: location.name }))) return
    run(() => deleteCompanyLocation(location.id), t("deleted"))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="h-11">
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>

      {initialLocations.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-5 py-10 text-center">
          <Building2 className="mx-auto size-9 text-muted-foreground" />
          <p className="mt-3 font-medium">{t("empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {initialLocations.map((location) => (
            <div key={location.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-wrap-balance">{location.companyName} — {location.name}</h2>
                    {location.isDefault && <Badge variant="success">{t("default")}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(`types.${location.type}`)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(location)} aria-label={t("edit")}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(location)} aria-label={t("delete")}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                {(location.city || location.address) && (
                  <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" />{[location.city, location.address].filter(Boolean).join(" · ")}</p>
                )}
                {location.contactName && (
                  <p className="flex items-center gap-2 text-muted-foreground"><UserRound className="size-4 shrink-0" />{location.contactName}</p>
                )}
                {location.contactMobile && (
                  <a href={`tel:${location.contactMobile}`} className="flex min-h-10 items-center gap-2 text-primary"><Phone className="size-4 shrink-0" />{location.contactMobile}</a>
                )}
                {location.mapsLink && (
                  <a href={location.mapsLink} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2 text-primary"><ExternalLink className="size-4 shrink-0" />{t("openMap")}</a>
                )}
              </div>

              {!location.isDefault && (
                <Button variant="outline" size="sm" className="mt-4 w-full" disabled={pending} onClick={() => run(() => setDefaultCompanyLocation(location.id), t("defaultChanged"))}>
                  <Star className="size-3.5" />
                  {t("setDefault")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} side="end" title={editing ? t("editTitle") : t("addTitle")} panelClassName="w-[32rem] max-w-full">
        <div className="h-full overflow-y-auto p-5 pt-14">
          <h2 className="text-lg font-semibold">{editing ? t("editTitle") : t("addTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("formHint")}</p>
          <LocationForm key={editing?.id ?? "new"} initial={editing} pending={pending} onCancel={() => setOpen(false)} onSubmit={save} />
        </div>
      </Sheet>
    </div>
  )
}
