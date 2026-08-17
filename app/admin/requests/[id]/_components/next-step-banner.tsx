import { getTranslations } from "next-intl/server"
import { ArrowRight, CheckCircle2, PauseCircle, XCircle } from "lucide-react"
import {
  deriveNextStep,
  type NextStepInput,
  type NextStepTone as Tone,
} from "@/lib/domain/request-next-step"

const TONE_STYLES: Record<Tone, string> = {
  action: "border-primary/30 bg-kara-purple-soft text-foreground",
  waiting: "border-kara-blue/30 bg-kara-blue-soft text-foreground",
  done: "border-green-200 bg-green-50 text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200",
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

export async function NextStepBanner(props: NextStepInput) {
  const t = await getTranslations("nextStep")
  const { key, tone } = deriveNextStep(props)
  const Icon = TONE_ICON[tone]

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${TONE_STYLES[tone]}`}
      role="status"
    >
      <Icon className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{t("label")}</p>
        <p className="text-sm font-medium leading-snug">{t(key)}</p>
      </div>
    </div>
  )
}
