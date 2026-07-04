import { getTranslations } from "next-intl/server"
import { ArrowRight, CheckCircle2, PauseCircle, XCircle } from "lucide-react"

type Tone = "action" | "waiting" | "done" | "paused" | "cancelled"

// Derives the single most useful "what to do next" prompt from request state so
// the detail page reads as a guided pipeline, not six equal-weight cards.
function derive(input: {
  status: string
  itemCount: number
  taskCount: number
  hasPendingSignoff: boolean
  hasSignedSignature: boolean
  hasAnySignature: boolean
}): { key: string; tone: Tone } {
  const { status, itemCount, taskCount, hasPendingSignoff, hasSignedSignature, hasAnySignature } =
    input

  if (status === "cancelled") return { key: "cancelled", tone: "cancelled" }
  if (status === "on_hold") return { key: "onHold", tone: "paused" }

  // A task waiting for sign-off is the most actionable thing regardless of request status
  if (hasPendingSignoff) return { key: "pendingSignoff", tone: "action" }

  if (status === "draft") {
    if (itemCount === 0) return { key: "draftNoItems", tone: "action" }
    if (taskCount === 0) return { key: "draftNoTasks", tone: "action" }
  }
  if (status === "assigned") return { key: "assigned", tone: "waiting" }
  if (status === "in_progress") return { key: "inProgress", tone: "waiting" }
  if (status === "completed") {
    if (!hasAnySignature) return { key: "needsSignature", tone: "action" }
    if (hasSignedSignature) return { key: "completed", tone: "done" }
    return { key: "needsSignature", tone: "action" }
  }
  return { key: "assigned", tone: "waiting" }
}

const TONE_STYLES: Record<Tone, string> = {
  action: "border-primary/30 bg-kara-purple-soft text-foreground",
  waiting: "border-kara-blue/30 bg-kara-blue-soft text-foreground",
  done: "border-green-200 bg-green-50 text-green-900",
  paused: "border-amber-200 bg-amber-50 text-amber-900",
  cancelled: "border-border bg-muted text-muted-foreground",
}

const TONE_ICON: Record<Tone, typeof ArrowRight> = {
  action: ArrowRight,
  waiting: ArrowRight,
  done: CheckCircle2,
  paused: PauseCircle,
  cancelled: XCircle,
}

export async function NextStepBanner(props: {
  status: string
  itemCount: number
  taskCount: number
  hasPendingSignoff: boolean
  hasSignedSignature: boolean
  hasAnySignature: boolean
}) {
  const t = await getTranslations("nextStep")
  const { key, tone } = derive(props)
  const Icon = TONE_ICON[tone]

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${TONE_STYLES[tone]}`}
      role="status"
    >
      <Icon className="size-5 shrink-0 rtl:rotate-180" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{t("label")}</p>
        <p className="text-sm font-medium leading-snug">{t(key)}</p>
      </div>
    </div>
  )
}
