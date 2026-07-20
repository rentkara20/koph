"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { updateTaskByToken } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type FailureReasonOption = { slug: string; label: string }

// Streamlined ad-hoc partner actions: one tap to start (accept+start merged),
// one tap to finish. Photo is optional (enforced server-side only when the
// admin set photoRequired). Not the shared request TaskActions — ad-hoc has no
// accept step, signature, or OTP.
export function AdHocActions({
  token,
  status,
  failureReasons,
}: {
  token: string
  status: string
  failureReasons: FailureReasonOption[]
}) {
  const t = useTranslations("tasks")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showFail, setShowFail] = useState(false)
  const [failureReason, setFailureReason] = useState("")
  const [failureNotes, setFailureNotes] = useState("")

  async function run(action: "start" | "mark_done" | "mark_failed") {
    setLoading(action)
    try {
      const result = await updateTaskByToken(
        token,
        action,
        action === "mark_failed" ? { failureReason, failureNotes } : undefined
      )
      if (result?.error) {
        toast.error(result.error === "PHOTO_REQUIRED" ? t("photoRequiredError") : result.error)
        setLoading(null)
        return
      }
      toast.success(tToast("taskUpdated"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
      setLoading(null)
    }
  }

  if (status === "pending") {
    return (
      <Button className="w-full" size="lg" disabled={loading !== null} onClick={() => run("start")}>
        {loading === "start" ? <Loader2 className="size-4 animate-spin" /> : t("adHocStart")}
      </Button>
    )
  }

  if (status === "in_progress") {
    if (showFail) {
      return (
        <div className="space-y-2">
          <Select value={failureReason} onChange={(e) => setFailureReason(e.target.value)}>
            <option value="">{t("selectFailureReason")}</option>
            {failureReasons.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </Select>
          <Textarea
            placeholder={t("failureNotes")}
            value={failureNotes}
            onChange={(e) => setFailureNotes(e.target.value)}
            className="h-16"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={loading !== null || !failureReason}
              onClick={() => run("mark_failed")}
            >
              {t("markFailed")}
            </Button>
            <Button variant="ghost" onClick={() => setShowFail(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex gap-2">
        <Button className="flex-1" size="lg" disabled={loading !== null} onClick={() => run("mark_done")}>
          {loading === "mark_done" ? <Loader2 className="size-4 animate-spin" /> : t("adHocDone")}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setShowFail(true)}>
          {t("markFailedShort")}
        </Button>
      </div>
    )
  }

  return null
}
