"use client"

import { translateActionError } from "@/lib/i18n/action-errors"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import Link from "next/link"
import { UserCheck, ChevronDown, ExternalLink, MapPin, X } from "lucide-react"
import { setRequestCustomerLocation, setRequestReceiver } from "@/lib/actions/requests"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InlineCreateReceiver } from "./inline-create-receiver"
import { Select } from "@/components/ui/select"
import { contactsForCustomerLocation } from "@/lib/domain/customer-location"

type Contact = {
  id: string
  name: string
  role: string | null
  mobile: string | null
  email: string | null
}

type Props = {
  requestId: string
  customerId: string
  contacts: Contact[]
  receiverContactId: string | null
  customerLocationId: string | null
  locations: Array<{ id: string; name: string; city: string | null; isDefault: boolean }>
  contactLocationLinks: Array<{ contactId: string; locationId: string; isPrimary: boolean }>
}

export function ReceiverSection({
  requestId,
  customerId,
  contacts,
  receiverContactId,
  customerLocationId,
  locations,
  contactLocationLinks,
}: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const t = useTranslations("requests")
  const tToast = useTranslations("toast")
  const current = contacts.find((c) => c.id === receiverContactId) ?? null
  const [showAllContacts, setShowAllContacts] = useState(false)
  const linkedContacts = contactsForCustomerLocation(contacts, contactLocationLinks, customerLocationId)
  const availableContacts = showAllContacts || !customerLocationId || linkedContacts.length === 0
    ? contacts
    : linkedContacts

  function selectLocation(locationId: string | null) {
    startTransition(async () => {
      try {
        const result = await setRequestCustomerLocation(requestId, locationId)
        if (result.error) { toast.error(translateActionError(result.error)); return }
        toast.success(tToast("updated"))
        setShowAllContacts(false)
        router.refresh()
      } catch {
        toast.error(tToast("genericError"))
      }
    })
  }

  function select(contactId: string | null) {
    startTransition(async () => {
      try {
        const result = await setRequestReceiver(requestId, contactId)
        if (result.error) { toast.error(translateActionError(result.error)); return }
        toast.success(tToast("updated"))
        router.refresh()
      } catch {
        toast.error(tToast("genericError"))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <MapPin className="size-3.5" />
          {t("customerLocation")}
        </p>
        <Select
          value={customerLocationId ?? ""}
          onChange={(event) => selectLocation(event.target.value || null)}
          disabled={pending}
          className="h-11"
        >
          <option value="">— {t("chooseCustomerLocation")} —</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}{location.city ? ` · ${location.city}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-start justify-between gap-3 border-t pt-4">
      <div className="flex-1 min-w-0">
        {current ? (
          <div className="text-sm">
            <p className="font-medium">{current.name}</p>
            {current.role && <p className="text-muted-foreground text-xs">{current.role}</p>}
            {current.mobile && <p className="text-muted-foreground text-xs">{current.mobile}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noReceiverSelected")}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {current && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={() => select(null)}
            title={t("clearReceiver")}
          >
            <X className="size-3.5" />
          </Button>
        )}

        <InlineCreateReceiver requestId={requestId} />

        <DropdownMenu>
          <DropdownMenuTrigger disabled={pending} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50">
            <UserCheck className="size-3.5 mr-0.5" />
            {current ? t("changeReceiver") : t("selectReceiver")}
            <ChevronDown className="size-3.5 ml-0.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {contacts.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("noEmployeesAdded")}
              </div>
            ) : (
              availableContacts.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => select(c.id)}
                  className="flex flex-col items-start gap-0"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.role && <span className="text-xs text-muted-foreground">{c.role}</span>}
                </DropdownMenuItem>
              ))
            )}
            {customerLocationId && linkedContacts.length < contacts.length && (
              <DropdownMenuItem onClick={() => setShowAllContacts((value) => !value)}>
                {showAllContacts ? t("showLocationContacts") : t("showAllCustomerContacts")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link
                href={`/admin/customers/${customerId}?returnTo=${encodeURIComponent(`/admin/requests/${requestId}`)}&assignToRequestId=${encodeURIComponent(requestId)}`}
                className="flex items-center gap-2 text-xs text-muted-foreground w-full"
              >
                <ExternalLink className="size-3.5" />
                {t("manageEmployees")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </div>
  )
}
