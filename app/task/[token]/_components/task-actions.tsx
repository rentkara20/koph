"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { updateTaskByToken } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const FAILURE_REASON_KEYS = [
  "customer_unavailable",
  "wrong_address",
  "item_damaged",
  "access_denied",
  "customer_rescheduled",
  "other",
] as const

type Action = "accept" | "reject" | "start" | "mark_done" | "mark_failed"

export function TaskActions({ token, status }: { token: string; status: string }) {
  const t = useTranslations("tasks")
  const tPortal = useTranslations("portal")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showFailForm, setShowFailForm] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [failureReason, setFailureReason] = useState("")
  const [failureNotes, setFailureNotes] = useState("")

  const SUCCESS_KEY: Record<Action, string> = {
    accept: "accepted",
    start: "started",
    mark_done: "done",
    reject: "rejected",
    mark_failed: "failed",
  }

  async function act(action: Action) {
    setLoading(action)
    try {
      const result = await updateTaskByToken(
        token,
        action,
        action === "mark_failed" ? { failureReason, failureNotes } : undefined
      )
      if (result.error) {
        // Map known server codes to friendly localized messages
        const msg = result.error === "PHOTO_REQUIRED" ? tPortal("photoRequired") : result.error
        toast.error(msg)
        setLoading(null)
        return
      }
      toast.success(tPortal(SUCCESS_KEY[action]))
      setShowFailForm(false)
      setConfirmReject(false)
      router.refresh()
      // router.refresh() keeps client state, so the loading flag must be
      // cleared explicitly — otherwise the next button (e.g. Start) renders disabled.
      setLoading(null)
    } catch {
      toast.error(tToast("genericError"))
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* pending → accept / reject */}
      {status === "pending" && (
        <div className="flex gap-3">
          <Button
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => act("accept")}
          >
            {loading === "accept" && <Loader2 className="size-4 animate-spin me-1" />}
            {t("accept")}
          </Button>
          {confirmReject ? (
            <div className="flex flex-1 gap-2">
              <Button
                variant="destructive"
                className="flex-1 h-12"
                disabled={loading !== null}
                onClick={() => act("reject")}
              >
                {loading === "reject" && <Loader2 className="size-4 animate-spin me-1" />}
                {tCommon("confirm")}
              </Button>
              <Button variant="outline" className="h-12" onClick={() => setConfirmReject(false)}>
                {tCommon("cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="flex-1 h-12 text-base"
              disabled={loading !== null}
              onClick={() => setConfirmReject(true)}
            >
              {t("reject")}
            </Button>
          )}
        </div>
      )}
      {confirmReject && status === "pending" && (
        <p className="text-xs text-muted-foreground">{tPortal("confirmReject")}</p>
      )}

      {/* accepted → start */}
      {status === "accepted" && (
        <Button
          className="w-full h-12 text-base"
          disabled={loading !== null}
          onClick={() => act("start")}
        >
          {loading === "start" && <Loader2 className="size-4 animate-spin me-1" />}
          {t("start")}
        </Button>
      )}

      {/* in_progress → mark done / mark failed */}
      {status === "in_progress" && !showFailForm && (
        <div className="flex gap-3">
          <Button
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => act("mark_done")}
          >
            {loading === "mark_done" && <Loader2 className="size-4 animate-spin me-1" />}
            {t("markDone")}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 text-base"
            disabled={loading !== null}
            onClick={() => setShowFailForm(true)}
          >
            {t("markFailed")}
          </Button>
        </div>
      )}

      {/* Failure form */}
      {status === "in_progress" && showFailForm && (
        <div className="rounded-xl bg-background border p-4 space-y-4">
          <p className="font-medium text-sm">{t("markFailed")}</p>

          <div className="space-y-1.5">
            <Label htmlFor="failureReason" className="text-xs">
              {t("failureReason")} <span className="text-destructive">*</span>
            </Label>
            <Select
              id="failureReason"
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              required
            >
              <option value="">—</option>
              {FAILURE_REASON_KEYS.map((r) => (
                <option key={r} value={r}>
                  {t(`failureReasons.${r}`)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="failureNotes" className="text-xs">
              {t("failureNotes")}{" "}
              <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
            </Label>
            <Textarea
              id="failureNotes"
              rows={3}
              value={failureNotes}
              onChange={(e) => setFailureNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              className="flex-1 h-12 text-base"
              disabled={!failureReason || loading !== null}
              onClick={() => act("mark_failed")}
            >
              {loading === "mark_failed" && <Loader2 className="size-4 animate-spin me-1" />}
              {tCommon("confirm")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowFailForm(false)
                setFailureReason("")
                setFailureNotes("")
              }}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
