import { notFound } from "next/navigation"
import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"
import { getTaskByToken, getTaskPhotos } from "@/lib/actions/tasks"
import { getActiveFailureReasons } from "@/lib/actions/failure-reasons"
import { getServicesForTask } from "@/lib/actions/task-services"
import { getCustomerContacts } from "@/lib/actions/customer-contacts"
import { getSignatureForTaskToken } from "@/lib/actions/signatures"
import { formatDate } from "@/lib/utils/format"
import { buildWhatsappUrl, customerGreetingMessage } from "@/lib/utils/whatsapp"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { TaskActions } from "./_components/task-actions"
import { PhotoUpload } from "./_components/photo-upload"
import { TaskChecklist } from "./_components/task-checklist"
import { SignatureStatus } from "./_components/signature-status"
import { OnSiteSigningFlow } from "./_components/on-site-signing"
import { Phone, MapPin, Mail, MessageCircle } from "lucide-react"

export default async function TaskPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [data, t, tStatus, tReq, tCust, tPortal, locale] = await Promise.all([
    getTaskByToken(token),
    getTranslations("tasks"),
    getTranslations("tasks.status"),
    getTranslations("requests"),
    getTranslations("customers"),
    getTranslations("portal"),
    getLocale(),
  ])

  if (!data) notFound()

  const { task, request, customer, requestType, items, isExpired, linkedContact } = data

  const [photos, taskServices, allContacts, sigData, failureReasons] = await Promise.all([
    getTaskPhotos(task.id),
    getServicesForTask(task.id),
    customer && !linkedContact ? getCustomerContacts(customer.id) : Promise.resolve([]),
    getSignatureForTaskToken(token),
    getActiveFailureReasons(),
  ])

  // If a specific contact was selected, show only that one; otherwise show all
  const customerContacts = linkedContact ? [linkedContact] : allContacts

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
            {(linkedContact?.city ?? customer?.city) && (
              <div>
                <p className="text-xs text-muted-foreground">{tCust("city")}</p>
                <p className="font-medium">{linkedContact?.city ?? customer?.city}</p>
              </div>
            )}
            {customer?.address && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">{tCust("address")}</p>
                <p className="font-medium">{customer.address}</p>
                {customer.mapsLink && (
                  <a
                    href={customer.mapsLink}
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
                          {tPortal("primaryReceiver")}
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
                          customerGreetingMessage({
                            courierName: "مندوب كارا",
                            customerName: c.name,
                            requestNumber: request.requestNumber,
                            itemsSummary,
                            signLink: sigData?.signLink ?? null,
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
          />
        )}

        {/* On-site signing — only once the task is in progress and not yet signed */}
        {canSign && (!sigData || !["signed"].includes(sigData.sigReq.status)) && (
          <OnSiteSigningFlow
            taskToken={token}
            customerName={customer?.name ?? null}
            customerMobile={customer?.mobile ?? null}
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
