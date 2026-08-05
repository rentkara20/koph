import { notFound } from "next/navigation"
import Image from "next/image"
import type { Customer } from "@/lib/db/schema"
import { getLocale, getTranslations } from "next-intl/server"
import { getTaskByToken, getTaskPhotosByToken } from "@/lib/actions/tasks"
import { getActiveFailureReasons } from "@/lib/actions/failure-reasons"
import { getServicesForTaskToken } from "@/lib/actions/task-services"
import { getCustomerContacts } from "@/lib/actions/customer-contacts"
import { getSignatureForTaskToken } from "@/lib/actions/signatures"
import { isDeliveryStageUnlocked } from "@/lib/actions/otp"
import { formatDate } from "@/lib/utils/format"
import { buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { getOperationalMessageTemplates } from "@/lib/actions/settings"
import { renderMessageTemplate } from "@/lib/domain/message-templates"
import { buildRequestRoutePlan, type RequestRoutePoint } from "@/lib/domain/request-route"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { TaskActions } from "./_components/task-actions"
import { PhotoUpload } from "./_components/photo-upload"
import { TaskChecklist } from "./_components/task-checklist"
import { SignatureStatus } from "./_components/signature-status"
import { OnSiteSigningFlow } from "./_components/on-site-signing"
import { PickupTaskView } from "./_components/pickup-task-view"
import { AdHocTaskView } from "./_components/ad-hoc-task-view"
import { BatchTaskView } from "./_components/batch-task-view"
import { ArrowDown, Phone, MapPin, Mail, MessageCircle, Warehouse } from "lucide-react"
import { getDefaultCompanyLocation } from "@/lib/actions/company-locations"

function PortalRoutePoint({
  label,
  point,
  warehouse,
  openMapLabel,
}: {
  label: string
  point: RequestRoutePoint
  warehouse: boolean
  openMapLabel: string
}) {
  const Icon = warehouse ? Warehouse : MapPin
  return (
    <div className="rounded-xl border bg-background p-3.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{point.label}</p>
          {point.contactName && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{point.contactName}</p>}
          {point.address && <p className="mt-0.5 text-xs text-muted-foreground">{point.address}</p>}
          {point.workingHours && <p className="mt-0.5 text-xs text-muted-foreground">{point.workingHours}</p>}
          {point.accessNotes && <p className="mt-1.5 text-xs text-muted-foreground">{point.accessNotes}</p>}
          <div className="mt-1.5 flex flex-wrap gap-3">
            {point.mobile && (
              <a href={`tel:${point.mobile}`} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-primary">
                <Phone className="size-3.5" />
                {point.mobile}
              </a>
            )}
            {point.mapsLink && (
              <a href={point.mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-primary">
                <MapPin className="size-3.5" />
                {openMapLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [data, t, tStatus, tReq, tCust, tPortal, locale, messageTemplates, companyLocation] = await Promise.all([
    getTaskByToken(token),
    getTranslations("tasks"),
    getTranslations("tasks.status"),
    getTranslations("requests"),
    getTranslations("customers"),
    getTranslations("portal"),
    getLocale(),
    getOperationalMessageTemplates(),
    getDefaultCompanyLocation(),
  ])

  if (!data) notFound()

  // Supplier-pickup tasks are a first-class procurement capability, not a
  // customer request — render the dedicated pickup UI (supplier address/contact,
  // per-line collect quantities). Never falls through to the request layout.
  if (data.task.kind === "supplier_pickup") {
    return <PickupTaskView token={token} />
  }

  // Ad-hoc tasks have no request/customer/PO — dedicated view shows the
  // title/reason/destination and drives the request-style lifecycle with
  // photo-only proof.
  if (data.task.kind === "ad_hoc") {
    return <AdHocTaskView token={token} />
  }

  // Genuine cross-request batch (Delivery Batching v2 P3) — no single request
  // to render this page's request-scoped layout around. Dedicated view groups
  // items by request/customer instead.
  if (data.batchGroups) {
    return <BatchTaskView token={token} data={data} />
  }

  const { task, request, requestType, items, isExpired, linkedContact, partner } = data
  if (!request) notFound()
  // request-kind branch always carries a customer row; narrow off the union.
  const customer = data.customer as Customer | null

  const [photos, taskServices, allContacts, sigData, failureReasons] = await Promise.all([
    getTaskPhotosByToken(token),
    getServicesForTaskToken(token),
    customer && !linkedContact ? getCustomerContacts(customer.id) : Promise.resolve([]),
    getSignatureForTaskToken(token),
    getActiveFailureReasons(),
  ])

  // If a specific contact was selected, show only that one; otherwise show all
  const customerContacts = linkedContact ? [linkedContact] : allContacts
  const routeContact = linkedContact ?? customer
  const selectedCustomerSite: RequestRoutePoint | null = (
    request.locationNameSnapshot || request.locationAddressSnapshot || request.locationMapsLinkSnapshot
  ) ? {
    label: request.locationNameSnapshot ?? tReq("routeContactMissingLabel"),
    address: request.locationAddressSnapshot,
    mapsLink: request.locationMapsLinkSnapshot,
    mobile: linkedContact?.mobile ?? customer?.mobile,
    contactName: linkedContact?.name ?? null,
  } : null
  const warehousePoint: RequestRoutePoint = companyLocation ? {
    label: `${companyLocation.companyName} — ${companyLocation.name}`,
    address: [companyLocation.city, companyLocation.address].filter(Boolean).join(" · ") || null,
    mapsLink: companyLocation.mapsLink,
    mobile: companyLocation.contactMobile,
    contactName: companyLocation.contactName,
    workingHours: companyLocation.workingHours,
    accessNotes: companyLocation.accessNotes,
  } : { label: tReq("karaWarehouse") }
  const routePlan = buildRequestRoutePlan({
    typeSlug: requestType?.slug,
    warehouse: warehousePoint,
    contact: selectedCustomerSite ?? {
      label: routeContact
        ? [routeContact.name, "role" in routeContact ? routeContact.role : null, routeContact.city]
            .filter(Boolean)
            .join(" · ")
        : tReq("routeContactMissingLabel"),
      address: routeContact?.address,
      mapsLink: routeContact?.mapsLink,
      mobile: routeContact?.mobile,
    },
    originOverride: request.origin,
    destinationOverride: request.destination,
  })

  const isTerminal = ["closed", "rejected", "failed", "cancelled"].includes(task.status)
  const canAct = !isTerminal && !isExpired
  // Signing is only possible once the partner has accepted AND started the task.
  const canSign = canAct && task.status === "in_progress"

  // Short items summary for the customer WhatsApp greeting.
  const itemsSummary = items
    .map((i) => `${i.description}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
    .join("، ")

  return (
    <div className="min-h-svh bg-muted/30">
      {/* Header — KARA purple, app-style */}
      <div className="bg-kara-purple text-white sticky top-0 z-20 shadow-[0_2px_8px_rgba(81,43,131,0.25)]">
        <div className="flex items-center gap-2.5 px-4 py-3 max-w-md mx-auto">
          <Image src="/kara-logo-light.png" alt="KARA" width={74} height={32} className="h-7 w-auto" priority />
          <span className="font-mono text-xs text-white/85">{request.requestNumber}</span>
          <div className="ms-auto flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
              {tStatus(task.status)}
            </span>
            <LocaleToggle onDark />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Expired / terminal banners */}
        {isExpired && !isTerminal && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            {tPortal("expired")}
          </div>
        )}
        {task.status === "closed" && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            ✓ {tPortal("allDone")}
          </div>
        )}
        {task.status === "pending_signoff" && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            {tPortal("done")}
          </div>
        )}
        {task.status === "rejected" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            {tPortal("rejected")}
          </div>
        )}
        {task.status === "cancelled" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            {tPortal("failed")}
          </div>
        )}
        {task.status === "failed" && task.failureReason && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {t(`failureReasons.${task.failureReason}`)}
            {task.failureNotes ? `. ${task.failureNotes}` : ""}
          </div>
        )}

        {/* Request info card */}
        <div className="rounded-xl bg-background border p-4 space-y-3">
          <h2 className="font-semibold text-kara-purple">{requestType?.nameEn ?? tPortal("yourTask")}</h2>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{tReq("customer")}</p>
              <p className="font-medium">{customer?.name ?? "—"}</p>
              {customer?.mobile && (
                <a
                  href={`tel:${customer.mobile}`}
                  className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-0.5"
                >
                  <Phone className="size-3" />
                  {customer.mobile}
                </a>
              )}
            </div>
            {(request.locationAddressSnapshot ?? linkedContact?.city ?? customer?.city) && (
              <div>
                <p className="text-xs text-muted-foreground">{selectedCustomerSite ? tReq("customerLocation") : tCust("city")}</p>
                <p className="font-medium">{request.locationAddressSnapshot ?? linkedContact?.city ?? customer?.city}</p>
              </div>
            )}
            {(request.locationAddressSnapshot || customer?.address) && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">{tCust("address")}</p>
                <p className="font-medium">{request.locationAddressSnapshot ?? customer?.address}</p>
                {(request.locationMapsLinkSnapshot ?? customer?.mapsLink) && (
                  <a
                    href={request.locationMapsLinkSnapshot ?? customer?.mapsLink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    View on map
                  </a>
                )}
              </div>
            )}
            {request.deliveryDate && (
              <div>
                <p className="text-xs text-muted-foreground">{tReq("deliveryDate")}</p>
                <p className="font-medium">{formatDate(request.deliveryDate)}</p>
              </div>
            )}
            {request.timeWindow && (
              <div>
                <p className="text-xs text-muted-foreground">{tReq("timeWindow")}</p>
                <p className="font-medium">{request.timeWindow}</p>
              </div>
            )}
          </div>

          {task.notes && (
            <div className="pt-1 border-t text-sm">
              <p className="text-xs text-muted-foreground mb-1">{tPortal("instructions")}</p>
              <p>{task.notes}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-background border p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-kara-purple">{tReq("routeSummary")}</p>
            <p className="text-xs text-muted-foreground">{tReq("courierRouteHint")}</p>
          </div>
          <div className="space-y-2">
            <PortalRoutePoint label={tReq("routeFrom")} point={routePlan.from} warehouse={routePlan.from.label === warehousePoint.label} openMapLabel={tReq("openMap")} />
            <ArrowDown className="mx-auto size-5 text-muted-foreground" />
            <PortalRoutePoint label={tReq("routeTo")} point={routePlan.to} warehouse={routePlan.to.label === warehousePoint.label} openMapLabel={tReq("openMap")} />
          </div>
          {routePlan.returnTo && (
            <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
              {tReq("swapReturnHint", { destination: routePlan.returnTo.label })}
            </p>
          )}
        </div>

        {/* Customer contacts / branch info for partner */}
        {customerContacts.length > 0 && (
          <div className="rounded-xl bg-background border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50">
              <p className="text-sm font-semibold text-kara-purple">{tPortal("contactPersons")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{tPortal("contactPersonsHint")}</p>
            </div>
            <ul className="divide-y">
              {customerContacts.map((c) => {
                const isReceiver = request.receiverContactId === c.id
                return (
                  <li key={c.id} className={`px-4 py-3 space-y-1${isReceiver ? " bg-purple-50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{c.name}</p>
                      {isReceiver && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {requestType?.slug === "collection" ? tPortal("pickupContact") : tPortal("primaryReceiver")}
                        </span>
                      )}
                    </div>
                    {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {c.mobile && (
                        <a
                          href={`tel:${c.mobile}`}
                          className="inline-flex items-center gap-1 text-xs text-primary font-medium"
                        >
                          <Phone className="size-3" />
                          {c.mobile}
                        </a>
                      )}
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          <Mail className="size-3" />
                          {c.email}
                        </a>
                      )}
                      {c.city && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                          <MapPin className="size-3" />
                          {c.city}
                        </span>
                      )}
                      {c.address && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {c.address}
                        </span>
                      )}
                      {c.mapsLink && (
                        <a
                          href={c.mapsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                        >
                          <MapPin className="size-3" />
                          {tPortal("viewOnMap")}
                        </a>
                      )}
                      {c.mobile && (() => {
                        const waUrl = buildWhatsappUrl(
                          c.mobile,
                          renderMessageTemplate(messageTemplates.customerEnRoute, {
                            courier_name: partner?.contactPerson ?? partner?.name ?? "مندوب كارا",
                            customer_name: c.name,
                            request_number: request.requestNumber,
                            items: itemsSummary,
                            sign_link: sigData?.signLink ?? "",
                          })
                        )
                        if (!waUrl) return null
                        return (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-green-600 font-medium hover:text-green-700"
                          >
                            <MessageCircle className="size-3" />
                            {tPortal("whatsapp")}
                          </a>
                        )
                      })()}
                    </div>
                    {c.notes && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
                  </li>
                )
              })}

            </ul>
          </div>
        )}

        {/* Items */}
        {items.length > 0 && (
          <div className="rounded-xl bg-background border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50">
              <p className="text-sm font-semibold text-kara-purple">{tPortal("items")} ({items.length})</p>
            </div>
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.description}</p>
                      {(item.brand || item.model) && (
                        <p className="text-xs text-muted-foreground">
                          {[item.brand, item.model].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {item.serialNumber && (
                        <p className="text-xs font-mono text-muted-foreground">S/N: {item.serialNumber}</p>
                      )}
                      {item.accessories && (
                        <p className="text-xs text-muted-foreground">+{item.accessories}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-medium bg-muted rounded-md px-2 py-0.5">
                      ×{item.quantity}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Service checklist */}
        {taskServices.length > 0 && (
          <TaskChecklist
            token={token}
            services={taskServices.map((s) => ({
              id: s.id,
              nameEn: s.nameEn ?? "",
              nameAr: s.nameAr ?? "",
              isCompleted: s.isCompleted,
            }))}
          />
        )}

        {/* Photos */}
        {(photos.length > 0 || task.status === "in_progress") && (
          <div className="rounded-xl bg-background border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50">
              <p className="text-sm font-semibold text-kara-purple">
                {t("photos")}{photos.length > 0 ? ` (${photos.length})` : ""}
              </p>
            </div>
            <div className="p-4">
              {task.status === "in_progress" ? (
                <PhotoUpload
                  token={token}
                  existingPhotos={photos.map((p) => ({
                    id: p.id,
                    fileUrl: p.fileUrl,
                    fileName: p.fileName,
                  }))}
                />
              ) : (
                photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                      >
                        <Image
                          src={photo.fileUrl}
                          alt={photo.fileName}
                          fill
                          className="object-cover"
                          sizes="33vw"
                        />
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Signature status — always show once signed; otherwise only after work has started */}
        {sigData && (sigData.sigReq.status === "signed" || canSign) && (
          <SignatureStatus
            status={sigData.sigReq.status}
            signedAt={sigData.sig?.signedAt ?? null}
            signerName={sigData.sig?.fullName ?? null}
            signLink={sigData.signLink}
            contactMobile={linkedContact?.mobile ?? customerContacts[0]?.mobile ?? customer?.mobile ?? null}
            customerName={customer?.name ?? null}
            requestNumber={request.requestNumber}
            deliveryDate={request.deliveryDate ?? null}
            messageTemplate={messageTemplates.signatureRequest}
          />
        )}

        {/* On-site signing — only once the task is in progress and not yet signed */}
        {canSign && (!sigData || !["signed"].includes(sigData.sigReq.status)) && (
          <OnSiteSigningFlow
            taskToken={token}
            customerName={customer?.name ?? null}
            customerMobile={customer?.mobile ?? null}
            stageUnlocked={await isDeliveryStageUnlocked(token)}
          />
        )}

        {/* Hint: signing unlocks after accepting + starting */}
        {canAct && !canSign && (task.status === "pending" || task.status === "accepted") && (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
            {task.status === "pending" ? tPortal("acceptToStart") : tPortal("startToSign")}
          </p>
        )}
      </div>

      {/* Sticky action bar — app-style, thumb-reachable */}
      {canAct && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div
            className="mx-auto max-w-md px-4 py-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <TaskActions
              token={token}
              status={task.status}
              failureReasons={failureReasons.map((r) => ({
                slug: r.slug,
                label: locale === "ar" ? r.nameAr : r.nameEn,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
