import { getTranslations } from "next-intl/server"
import {
  ClipboardList,
  Handshake,
  Package,
  Laptop,
  Truck,
  Check,
  type LucideIcon,
} from "lucide-react"
import type { JourneyStage, JourneyStageKey, StageState } from "@/lib/domain/order-journey"

const STAGE_ICON: Record<JourneyStageKey, LucideIcon> = {
  order: ClipboardList,
  sourcing: Handshake,
  procurement: Package,
  assets: Laptop,
  delivery: Truck,
}

// Node ring/fill per state. Done reads as settled (green), active as the live
// focus (kara purple), pending as not-yet-reached (muted).
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

export async function OrderJourney({ stages }: { stages: JourneyStage[] }) {
  const t = await getTranslations("orders.journey")

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </p>
      <ol className="flex items-start gap-1 overflow-x-auto pb-1" aria-label={t("title")}>
        {stages.map((stage, index) => {
          const Icon = STAGE_ICON[stage.key]
          const isLast = index === stages.length - 1
          // Connector fills green once the NEXT stage is under way or complete.
          const nextReached = !isLast && stages[index + 1].state !== "pending"
          return (
            <li key={stage.key} className="flex flex-1 flex-col items-center gap-2 min-w-[68px]">
              <div className="flex w-full items-center">
                <span className="h-0.5 flex-1 bg-transparent" aria-hidden />
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 ${NODE_STYLES[stage.state]}`}
                >
                  {stage.state === "done" ? (
                    <Check className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                {!isLast && (
                  <span
                    className={`h-0.5 flex-1 ${nextReached ? "bg-green-500" : "bg-border"}`}
                    aria-hidden
                  />
                )}
                {isLast && <span className="h-0.5 flex-1 bg-transparent" aria-hidden />}
              </div>
              <div className="text-center">
                <p className={`text-xs leading-tight ${LABEL_STYLES[stage.state]}`}>
                  {t(`stages.${stage.key}`)}
                </p>
                {stage.count > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {t(`count.${stage.key}`, { count: stage.count })}
                  </p>
                )}
                <p className="sr-only">{t(`state.${stage.state}`)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
