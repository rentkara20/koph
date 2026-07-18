import Image from "next/image"
import { getTranslations, getLocale } from "next-intl/server"
import { Phone } from "lucide-react"
import { getTaskByToken, getTaskPhotosByToken } from "@/lib/actions/tasks"
import { getActiveFailureReasons } from "@/lib/actions/failure-reasons"
import { getServicesForTaskToken } from "@/lib/actions/task-services"
import { getBatchSignaturesForTaskToken } from "@/lib/actions/signatures"
import { isDeliveryStageUnlocked } from "@/lib/actions/otp"
import { getOperationalMessageTemplates } from "@/lib/actions/settings"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { TaskActions } from "./task-actions"
import { PhotoUpload } from "./photo-upload"
import { TaskChecklist } from "./task-checklist"
import { SignatureStatus } from "./signature-status"
import { OnSiteSigningFlow } from "./on-site-signing"

// Delivery Batching v2 P3/P4: dedicated view for a genuine cross-request
// batch (one trip, items from more than one customer request). Items group by
// request/customer so the courier can tell what belongs to whom. Each group
// gets its OWN signature — never one shared signature across requests (see
// project_koph_delivery_batching memory / design doc). Admin sign-off (P4)
// requires every group in the batch to have accepted proof before the whole
// task can close — see signOffTask in lib/actions/tasks.ts.
type Data = NonNullable<Awaited<ReturnType<typeof getTaskByToken>>>

export async function BatchTaskView({ token, data }: { token: string; data: Data }) {
  const [t, tStatus, tPortal, locale, photos, taskServices, failureReasons, signatures, messageTemplates] =
    await Promise.all([
      getTranslations("tasks"),
      getTranslations("tasks.status"),
      getTranslations("portal"),
      getLocale(),
      getTaskPhotosByToken(token),
      getServicesForTaskToken(token),
      getActiveFailureReasons(),
      getBatchSignaturesForTaskToken(token),
      getOperationalMessageTemplates(),
    ])

  const { task, partner, batchGroups, isExpired } = data
  const groups = batchGroups ?? []
  const sigByRequestId = new Map(signatures.map((s) => [s.requestId, s]))
  const isTerminal = ["closed", "rejected", "failed", "cancelled"].includes(task.status)
  const canAct = !isTerminal && !isExpired
  // Signing is only possible once the partner has accepted AND started the task.
  const canSign = canAct && task.status === "in_progress"

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="bg-kara-purple text-white sticky top-0 z-20 shadow-[0_2px_8px_rgba(81,43,131,0.25)]">
        <div className="flex items-center gap-2.5 px-4 py-3 max-w-md mx-auto">
          <Image src="/kara-logo-light.png" alt="KARA" width={74} height={32} className="h-7 w-auto" priority />
          <span className="text-xs text-white/85">{partner?.name}</span>
          <div className="ms-auto flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
              {tStatus(task.status)}
            </span>
            <LocaleToggle onDark />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
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
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">{tPortal("rejected")}</div>
        )}
        {task.status === "cancelled" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">{tPortal("failed")}</div>
        )}
        {task.status === "failed" && task.failureReason && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {t(`failureReasons.${task.failureReason}`)}
            {task.failureNotes ? `. ${task.failureNotes}` : ""}
          </div>
        )}

        <div className="rounded-xl bg-background border p-4 space-y-1">
          <h2 className="font-semibold text-kara-purple">{tPortal("batchTitle")}</h2>
          <p className="text-sm text-muted-foreground">{tPortal("batchSubtitle", { count: groups.length })}</p>
          {task.notes && (
            <div className="pt-2 mt-2 border-t text-sm">
              <p className="text-xs text-muted-foreground mb-1">{tPortal("instructions")}</p>
              <p>{task.notes}</p>
            </div>
          )}
        </div>

        {await Promise.all(
          groups.map(async (group) => {
            const sigData = sigByRequestId.get(group.request.id) ?? null
            const stageUnlocked = canSign ? await isDeliveryStageUnlocked(token, group.request.id) : false
            const isSigned = sigData?.sigReq?.status === "signed"
            const isRejected = sigData?.sigReq?.status === "rejected"

            return (
              <div key={group.request.id} className="rounded-xl bg-background border overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-kara-purple">{group.customer?.name ?? "—"}</p>
                    <p className="text-xs font-mono text-muted-foreground">{group.request.requestNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.customer?.mobile && (
                      <a
                        href={`tel:${group.customer.mobile}`}
                        className="inline-flex items-center gap-1 text-xs text-primary font-medium"
                      >
                        <Phone className="size-3" />
                        {group.customer.mobile}
                      </a>
                    )}
                    <span className="shrink-0 text-xs font-medium bg-muted rounded-md px-2 py-0.5">
                      {tPortal("batchGroupItems", { count: group.items.length })}
                    </span>
                  </div>
                </div>
                <ul className="divide-y">
                  {group.items.map((item) => (
                    <li key={item.id} className="px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{item.description}</p>
                          {(item.brand || item.model) && (
                            <p className="text-xs text-muted-foreground">{[item.brand, item.model].filter(Boolean).join(" · ")}</p>
                          )}
                          {item.serialNumber && <p className="text-xs font-mono text-muted-foreground">S/N: {item.serialNumber}</p>}
                          {item.accessories && <p className="text-xs text-muted-foreground">+{item.accessories}</p>}
                        </div>
                        <span className="shrink-0 text-xs font-medium bg-muted rounded-md px-2 py-0.5">×{item.quantity}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Per-request signature — never shared across groups. */}
                <div className="p-4 border-t space-y-2">
                  {(isSigned || isRejected) && sigData?.sigReq && (
                    <SignatureStatus
                      status={sigData.sigReq.status}
                      signedAt={sigData.sig?.signedAt ?? null}
                      signerName={sigData.sig?.fullName ?? null}
                      signLink={sigData.signLink ?? ""}
                      contactMobile={group.customer?.mobile ?? null}
                      customerName={group.customer?.name ?? null}
                      requestNumber={group.request.requestNumber}
                      deliveryDate={group.request.deliveryDate ?? null}
                      messageTemplate={messageTemplates.signatureRequest}
                    />
                  )}
                  {canSign && !isSigned && !isRejected && (
                    <OnSiteSigningFlow
                      taskToken={token}
                      requestId={group.request.id}
                      customerName={group.customer?.name ?? null}
                      customerMobile={group.customer?.mobile ?? null}
                      stageUnlocked={stageUnlocked}
                    />
                  )}
                </div>
              </div>
            )
          })
        )}

        {taskServices.length > 0 && (
          <TaskChecklist
            token={token}
            services={taskServices.map((s) => ({ id: s.id, nameEn: s.nameEn ?? "", nameAr: s.nameAr ?? "", isCompleted: s.isCompleted }))}
          />
        )}

        {(photos.length > 0 || task.status === "in_progress") && (
          <div className="rounded-xl bg-background border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50">
              <p className="text-sm font-semibold text-kara-purple">
                {t("photos")}{photos.length > 0 ? ` (${photos.length})` : ""}
              </p>
            </div>
            <div className="p-4">
              {task.status === "in_progress" ? (
                <PhotoUpload token={token} existingPhotos={photos.map((p) => ({ id: p.id, fileUrl: p.fileUrl, fileName: p.fileName }))} />
              ) : (
                photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                        <Image src={photo.fileUrl} alt={photo.fileName} fill className="object-cover" sizes="33vw" />
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {canAct && !canSign && (task.status === "pending" || task.status === "accepted") && (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
            {task.status === "pending" ? tPortal("acceptToStart") : tPortal("startToSign")}
          </p>
        )}
      </div>

      {canAct && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-md px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            <TaskActions
              token={token}
              status={task.status}
              failureReasons={failureReasons.map((r) => ({ slug: r.slug, label: locale === "ar" ? r.nameAr : r.nameEn }))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
