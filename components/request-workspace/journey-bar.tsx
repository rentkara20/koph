import { getTranslations } from "next-intl/server"
import { Check } from "lucide-react"
import type { RequestJourneyStage, StageState } from "@/lib/domain/order-journey"
import { cn } from "@/lib/utils"

// Node ring/fill per state — same visual language as the legacy order journey
// strip: done settles green, active is the live kara-purple focus.
const NODE_STYLES: Record<StageState, string> = {
  done: "border-green-500 bg-green-500 text-white",
  active: "border-primary bg-kara-purple-soft text-primary",
  pending: "border-border bg-muted text-muted-foreground",
}

const LABEL_STYLES: Record<StageState, string> = {
  done: "text-foreground",
  active: "text-primary font-medium",
  pending: "text-muted-foreground",
}

export async function JourneyBar({ stages }: { stages: RequestJourneyStage[] }) {
  const t = await getTranslations("workspace.journey")

  return (
    <ol className="flex items-start gap-0 overflow-x-auto pb-1" aria-label={t("label")}>
      {stages.map((stage, i) => (
        <li
          key={stage.key}
          className="flex w-20 shrink-0 flex-col items-center sm:w-auto sm:min-w-0 sm:flex-1"
        >
          <div className="flex w-full items-center">
            <span
              className={cn("h-px flex-1", i === 0 ? "bg-transparent" : "bg-border")}
              aria-hidden
            />
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                NODE_STYLES[stage.state]
              )}
            >
              {stage.state === "done" ? (
                <Check className="size-3.5" aria-hidden />
              ) : stage.count > 0 ? (
                stage.count
              ) : null}
            </span>
            <span
              className={cn("h-px flex-1", i === stages.length - 1 ? "bg-transparent" : "bg-border")}
              aria-hidden
            />
          </div>
          <span
            className={cn(
              "mt-1 whitespace-nowrap text-center text-[10px] leading-tight sm:text-[11px]",
              LABEL_STYLES[stage.state]
            )}
            title={t(stage.key)}
          >
            {t(stage.key)}
          </span>
        </li>
      ))}
    </ol>
  )
}
