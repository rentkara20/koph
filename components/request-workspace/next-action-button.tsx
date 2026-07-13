import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, Clock } from "lucide-react"
import type { NextAction } from "@/lib/domain/next-action"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const URGENCY_VARIANT: Record<NextAction["urgency"], "default" | "outline" | "secondary"> = {
  now: "default",
  soon: "secondary",
  scheduled: "outline",
}

export async function NextActionButton({
  action,
  size = "sm",
}: {
  action: NextAction
  size?: "sm" | "default"
}) {
  const t = await getTranslations("workspace.nextActions")

  return (
    <Link
      href={action.href}
      className={cn(buttonVariants({ variant: URGENCY_VARIANT[action.urgency], size }), "gap-1.5")}
    >
      {action.urgency === "scheduled" ? (
        <Clock className="size-3.5" aria-hidden />
      ) : (
        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
      )}
      {t(action.key)}
    </Link>
  )
}

// Amber blocker card (#7-style): what is being waited on and who owns it.
export async function BlockerCard({ action }: { action: NextAction }) {
  const t = await getTranslations("workspace")

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <div className="min-w-0">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          {t(`blockers.${action.blockedBy}`)}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("blockerOwner", { role: t(`roles.${action.ownerRole}`) })}
        </p>
      </div>
      <NextActionButton action={{ ...action, urgency: "soon" }} />
    </div>
  )
}
