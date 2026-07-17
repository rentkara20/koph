"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  Building2,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import type { CustomerLocation } from "@/lib/db/schema"
import {
  createCustomerLocation,
  deleteCustomerLocation,
  setDefaultCustomerLocation,
  updateCustomerLocation,
  type CustomerLocationInput,
} from "@/lib/actions/customer-locations"
import {
  createCustomerContact,
  deleteCustomerContact,
  updateCustomerContact,
  type ContactInput,
} from "@/lib/actions/customer-contacts"
import { createAndAssignRequestReceiver } from "@/lib/actions/requests"
import { groupCustomerLocationsWithContacts } from "@/lib/domain/customer-location"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { CustomerLocationForm } from "./customer-locations-section"
import {
  ContactForm,
  type Contact,
  type ContactLocationLink,
} from "./contacts-section"

type ActionResult = { error?: string; id?: string }

export function CustomerLocationsPeopleSection({
  customerId,
  locations,
  contacts,
  contactLocationLinks,
  returnTo,
  assignToRequestId,
}: {
  customerId: string
  locations: CustomerLocation[]
  contacts: Contact[]
  contactLocationLinks: ContactLocationLink[]
  returnTo?: string
  assignToRequestId?: string
}) {
  const t = useTranslations("customerSites")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [locationSheetOpen, setLocationSheetOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<CustomerLocation | null>(null)
  const [personSheetOpen, setPersonSheetOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Contact | null>(null)
  const grouped = groupCustomerLocationsWithContacts(locations, contacts, contactLocationLinks)

  function run(
    action: () => Promise<ActionResult>,
    success: string,
    close?: "location" | "person",
    navigateTo?: string
  ) {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(success)
      if (close === "location") setLocationSheetOpen(false)
      if (close === "person") setPersonSheetOpen(false)
      if (navigateTo) router.push(navigateTo)
      else router.refresh()
    })
  }

  function saveLocation(data: CustomerLocationInput) {
    run(
      () => editingLocation
        ? updateCustomerLocation(editingLocation.id, customerId, data)
        : createCustomerLocation(customerId, data),
      editingLocation ? t("updated") : t("created"),
      "location"
    )
  }

  function savePerson(data: ContactInput) {
    if (editingPerson) {
      run(
        () => updateCustomerContact(editingPerson.id, customerId, data),
        tToast("updated"),
        "person"
      )
      return
    }

    run(
      () => assignToRequestId
        ? createAndAssignRequestReceiver(assignToRequestId, data)
        : createCustomerContact(customerId, data),
      tToast("created"),
      "person",
      assignToRequestId ? returnTo : undefined
    )
  }

  function openNewLocation() {
    setEditingLocation(null)
    setLocationSheetOpen(true)
  }

  function openNewPerson() {
    setEditingPerson(null)
    setPersonSheetOpen(true)
  }

  function openPerson(person: Contact) {
    setEditingPerson(person)
    setPersonSheetOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="h-11" onClick={openNewLocation}>
          <Building2 className="size-4" />
          {t("add")}
        </Button>
        <Button className="h-11" onClick={openNewPerson}>
          <UserRound className="size-4" />
          {t("addPerson")}
        </Button>
      </div>

      {locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-5 py-9 text-center">
          <Building2 className="mx-auto size-9 text-muted-foreground" />
          <p className="mt-3 font-medium">{t("empty")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground text-pretty">{t("unifiedEmptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.groups.map(({ location, contacts: locationContacts }) => (
            <section key={location.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-wrap-balance">{location.name}</h3>
                      {location.isDefault && <Badge variant="success">{t("default")}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t(`types.${location.type}`)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={t("edit")}
                      onClick={() => { setEditingLocation(location); setLocationSheetOpen(true) }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={t("delete")}
                      onClick={() => {
                        if (confirm(t("deleteConfirm", { name: location.name }))) {
                          run(() => deleteCustomerLocation(customerId, location.id), t("deleted"))
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {(location.city || location.address) && (
                  <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground text-pretty">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    {[location.city, location.address].filter(Boolean).join(" · ")}
                  </p>
                )}

                <div className="mt-4 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <UsersRound className="size-3.5" />
                      {t("peopleAtLocation")}
                    </p>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{locationContacts.length}</span>
                  </div>
                  {locationContacts.length === 0 ? (
                    <button type="button" onClick={openNewPerson} className="flex min-h-11 w-full items-center justify-center rounded-lg border border-dashed px-3 text-xs font-medium text-primary hover:bg-muted/50">
                      <Plus className="me-1.5 size-3.5" />
                      {t("addPersonToLocation")}
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      {locationContacts.map((person) => {
                        const link = contactLocationLinks.find((item) => item.contactId === person.id && item.locationId === location.id)
                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => openPerson(person)}
                            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-muted"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <UserRound className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{person.name}</span>
                              {(person.role || person.mobile) && (
                                <span className="block truncate text-xs text-muted-foreground">{[person.role, person.mobile].filter(Boolean).join(" · ")}</span>
                              )}
                            </span>
                            {link?.isPrimary && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {(location.mapsLink || !location.isDefault) && (
                <div className="flex flex-wrap gap-2 border-t bg-muted/20 px-4 py-2.5">
                  {location.mapsLink && (
                    <a href={location.mapsLink} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-10")}>
                      <ExternalLink className="size-4" />{t("openMap")}
                    </a>
                  )}
                  {!location.isDefault && (
                    <Button variant="ghost" size="sm" className="min-h-10" disabled={pending} onClick={() => run(() => setDefaultCustomerLocation(customerId, location.id), t("defaultChanged"))}>
                      <Star className="size-3.5" />{t("setDefault")}
                    </Button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {grouped.unassignedContacts.length > 0 && (
        <section className="rounded-2xl border border-dashed p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t("unassignedPeople")}</h3>
              <p className="text-xs text-muted-foreground text-pretty">{t("unassignedPeopleHint")}</p>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{grouped.unassignedContacts.length}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {grouped.unassignedContacts.map((person) => (
              <button key={person.id} type="button" onClick={() => openPerson(person)} className="flex min-h-11 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-start transition-colors hover:bg-muted">
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{person.name}</span>
                  {(person.role || person.mobile) && <span className="block truncate text-xs text-muted-foreground">{[person.role, person.mobile].filter(Boolean).join(" · ")}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {contacts.length === 0 && locations.length > 0 && (
        <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{t("noPeopleHint")}</p>
      )}

      <Sheet open={locationSheetOpen} onClose={() => setLocationSheetOpen(false)} side="end" title={editingLocation ? t("editTitle") : t("addTitle")} panelClassName="w-[36rem] max-w-full">
        <div className="h-full overflow-y-auto p-5 pt-14">
          <h2 className="text-lg font-semibold">{editingLocation ? t("editTitle") : t("addTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("formHint")}</p>
          <CustomerLocationForm key={editingLocation?.id ?? "new"} initial={editingLocation} pending={pending} onCancel={() => setLocationSheetOpen(false)} onSubmit={saveLocation} />
        </div>
      </Sheet>

      <Sheet open={personSheetOpen} onClose={() => setPersonSheetOpen(false)} side="end" title={editingPerson ? t("editPerson") : t("addPerson")} panelClassName="w-[34rem] max-w-full">
        <div className="h-full overflow-y-auto p-5 pt-14">
          <h2 className="text-lg font-semibold">{editingPerson ? t("editPerson") : t("addPerson")}</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("personFormHint")}</p>
          <ContactForm
            key={editingPerson?.id ?? "new"}
            initial={editingPerson ?? undefined}
            locations={locations}
            initialLinks={editingPerson ? contactLocationLinks.filter((link) => link.contactId === editingPerson.id) : []}
            saving={pending}
            onCancel={() => setPersonSheetOpen(false)}
            onSave={savePerson}
          />
          {editingPerson && (
            <Button
              type="button"
              variant="destructive"
              className="mt-4 h-11 w-full"
              disabled={pending}
              onClick={() => {
                if (confirm(t("deletePersonConfirm", { name: editingPerson.name }))) {
                  run(() => deleteCustomerContact(editingPerson.id, customerId), tToast("deleted"), "person")
                }
              }}
            >
              <Trash2 className="size-4" />
              {t("deletePerson")}
            </Button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
