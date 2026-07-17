"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { CalendarClock, ChevronDown, CirclePause, Play, RefreshCw, XCircle } from "lucide-react"
import { resumeRequest, updateRequestStatus } from "@/lib/actions/requests"
import {
  requestExceptionActions,
  type RequestExceptionAction,
} from "@/lib/domain/request-exception-actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TimeWindowPicker } from "@/components/time-window-picker"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

type FormAction = "hold" | "reschedule" | "cancel"

function todayForInput() {
  const today = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}

function ActionIcon({ action }: { action: RequestExceptionAction }) {
  if (action === "hold") return <CirclePause className="size-4" />
  if (action === "reschedule") return <CalendarClock className="size-4" />
  if (action === "cancel") return <XCircle className="size-4" />
  if (action === "retry" || action === "reopen") return <RefreshCw className="size-4" />
  return <Play className="size-4" />
}

export function RequestStatusActions({
  requestId,
  currentStatus,
}: {
  requestId: string
  currentStatus: string
}) {
  const t = useTranslations("requests")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const actions = requestExceptionActions(currentStatus)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeForm, setActiveForm] = useState<FormAction | null>(null)
  const [reason, setReason] = useState("")
  const [plannedDate, setPlannedDate] = useState("")
  const [timeWindow, setTimeWindow] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (actions.length === 0) return null

  function closeForm() {
    setActiveForm(null)
    setReason("")
    setPlannedDate("")
    setTimeWindow("")
    setError("")
  }

  async function handleRecovery() {
    setLoading(true)
    try {
      const result = await resumeRequest(requestId)
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(tToast("statusUpdated"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setLoading(false)
    }
  }

  function chooseAction(action: RequestExceptionAction) {
    setMenuOpen(false)
    if (action === "resume" || action === "retry" || action === "reopen") {
      void handleRecovery()
      return
    }
    setActiveForm(action)
    setReason("")
    setPlannedDate("")
    setTimeWindow("")
    setError("")
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeForm) return

    const trimmedReason = reason.trim()
    if ((activeForm === "hold" || activeForm === "cancel") && !trimmedReason) {
      setError(t("reasonRequired"))
      return
    }

    const nextPlannedDate = activeForm === "reschedule" && plannedDate
      ? new Date(plannedDate).getTime()
      : undefined
    if (activeForm === "reschedule" && (!nextPlannedDate || !timeWindow)) {
      setError(t("schedulePlanRequired"))
      return
    }

    const status = activeForm === "hold"
      ? "on_hold"
      : activeForm === "cancel"
        ? "cancelled"
        : "rescheduled"

    setLoading(true)
    setError("")
    try {
      const result = await updateRequestStatus(requestId, status, {
        reason: trimmedReason || undefined,
        plannedDate: nextPlannedDate,
        timeWindow: timeWindow || undefined,
      })
      if (result.error) {
        setError(translateActionError(result.error))
        return
      }
      toast.success(tToast("statusUpdated"))
      closeForm()
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          disabled={loading}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "gap-1.5 disabled:opacity-50"
          )}
        >
          {t("requestActions")}
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("exceptionalActions")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {actions.map((action) => (
              <DropdownMenuItem
                key={action}
                variant={action === "cancel" ? "destructive" : "default"}
                onClick={() => chooseAction(action)}
              >
                <ActionIcon action={action} />
                {t(`actions.${action}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeForm && (
        <form
          onSubmit={handleSubmit}
          className="absolute end-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
        >
          <div>
            <p className="text-sm font-semibold">{t(`actionForms.${activeForm}.title`)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(`actionForms.${activeForm}.hint`)}</p>
          </div>

          {activeForm === "reschedule" && (
            <div className="space-y-1.5">
              <Label htmlFor="request-planned-date">{t("plannedDate")}</Label>
              <Input
                id="request-planned-date"
                type="date"
                min={todayForInput()}
                value={plannedDate}
                onChange={(event) => setPlannedDate(event.target.value)}
                required
              />
              <Label>{t("timeWindow")}</Label>
              <TimeWindowPicker
                idPrefix="request-action-window"
                value={timeWindow}
                onChange={setTimeWindow}
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="request-action-reason">
              {t("reason")}
              {activeForm === "reschedule" && (
                <span className="ms-1 text-xs text-muted-foreground">({tCommon("optional")})</span>
              )}
            </Label>
            <Textarea
              id="request-action-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t(`actionForms.${activeForm}.reasonPlaceholder`)}
              required={activeForm !== "reschedule"}
              autoFocus={activeForm !== "reschedule"}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeForm} disabled={loading}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={activeForm === "cancel" ? "destructive" : "default"}
              disabled={loading}
            >
              {loading ? tCommon("loading") : t("confirmAction")}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
