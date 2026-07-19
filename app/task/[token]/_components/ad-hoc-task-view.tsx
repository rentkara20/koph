import { notFound } from "next/navigation"
import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"
import { ClipboardList, MapPin } from "lucide-react"
import { getTaskByToken, getTaskPhotosByToken } from "@/lib/actions/tasks"
import { getActiveFailureReasons } from "@/lib/actions/failure-reasons"
import { LocaleToggle } from "@/components/layout/locale-toggle"
import { PhotoUpload } from "./photo-upload"
import { TaskActions } from "./task-actions"

// Ad-hoc partner view. An operational trip with no request/PO context — shows
// the free-text title, reason, and destination, and drives the request-style
// lifecycle (Accept → Start → Done) with photo-only proof. No customer,
// signature, or OTP. Admin sign-off closes it (see signOffAdHocTask).
export async function AdHocTaskView({ token }: { token: string }) {
  const [data, t, tStatus, tPortal, tReason, photos, failureReasons, locale] = await Promise.all([
    getTaskByToken(token),
    getTranslations("tasks"),
    getTranslations("tasks.status"),
    getTranslations("portal"),
    getTranslations("tasks.adHocReason"),
    getTaskPhotosByToken(token),
    getActiveFailureReasons(),
    getLocale(),
  ])
  if (!data || data.task.kind !== "ad_hoc") notFound()

  const { task, partner, isExpired } = data
  const isTerminal = ["closed", "rejected", "failed", "cancelled"].includes(task.status)
  const canAct = !isTerminal && !isExpired

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="sticky top-0 z-20 bg-kara-purple text-white shadow-[0_2px_8px_rgba(81,43,131,0.25)]">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-3">
          <Image src="/kara-logo-light.png" alt="KARA" width={74} height={32} className="h-7 w-auto" priority />
          <span className="text-xs font-medium text-white/85">{t("adHocTaskLabel")}</span>
          <div className="ms-auto flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{tStatus(task.status)}</span>
            <LocaleToggle onDark />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        {isExpired && !isTerminal && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {tPortal("expired")}
          </div>
        )}
        {task.status === "closed" && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            ✓ {tPortal("allDone")}
          </div>
        )}
        {task.status === "pending_signoff" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {tPortal("done")}
          </div>
        )}
        {task.status === "failed" && task.failureReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {t(`failureReasons.${task.failureReason}`)}
            {task.failureNotes ? `. ${task.failureNotes}` : ""}
          </div>
        )}

        {/* Task detail */}
        <div className="space-y-3 rounded-xl border bg-background p-4">
          <div className="flex items-start gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="font-semibold text-kara-purple">{task.adHocTitle}</h1>
              {task.adHocReason && (
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{tReason(task.adHocReason)}</p>
              )}
              {partner?.name && <p className="mt-0.5 text-xs text-muted-foreground">{partner.name}</p>}
            </div>
          </div>

          {task.destinationLocation && (
            <div className="flex items-start gap-1.5 border-t pt-3 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tPortal("destination")}</p>
                <p className="font-medium">{task.destinationLocation}</p>
              </div>
            </div>
          )}

          {task.notes && (
            <div className="border-t pt-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">{tPortal("instructions")}</p>
              <p>{task.notes}</p>
            </div>
          )}
        </div>

        {/* Photo proof (partner uploads while working) */}
        {(photos.length > 0 || task.status === "in_progress") && (
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="border-b bg-muted/50 px-4 py-3">
              <p className="text-sm font-semibold text-kara-purple">
                {t("photos")}{photos.length > 0 ? ` (${photos.length})` : ""}
              </p>
            </div>
            <div className="p-4">
              {task.status === "in_progress" ? (
                <PhotoUpload
                  token={token}
                  existingPhotos={photos.map((p) => ({ id: p.id, fileUrl: p.fileUrl, fileName: p.fileName }))}
                />
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                      <Image src={photo.fileUrl} alt={photo.fileName} fill className="object-cover" sizes="33vw" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {canAct && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-md px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
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
