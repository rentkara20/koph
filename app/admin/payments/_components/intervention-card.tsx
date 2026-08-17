import Link from "next/link"
import { AlertTriangle, ChevronRight, Clock, EyeOff } from "lucide-react"
import type { InterventionQueue } from "@/lib/actions/payments"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type QueueMeta = {
  label: string
  description: string
  icon: typeof AlertTriangle
  tone: string
}

const QUEUE_META: Record<InterventionQueue["key"], QueueMeta> = {
  awaitingSignoff: {
    label: "Awaiting your sign-off",
    description: "Trips finished — no payment exists until you decide.",
    icon: AlertTriangle,
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  unpaidClosed: {
    label: "Closed with no payment",
    description: "Task closed but no payment line was created — usually a missing partner contract.",
    icon: EyeOff,
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  stalePayments: {
    label: "Approved, never batched",
    description: "Payment lines older than 14 days still not in a batch.",
    icon: Clock,
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
}

function waitingDays(oldestAt: number | null): string | null {
  if (oldestAt === null) return null
  const days = Math.floor((Date.now() - oldestAt) / 86_400_000)
  if (days < 1) return "today"
  return `oldest ${days} day${days === 1 ? "" : "s"}`
}

export function InterventionCard({ queues }: { queues: InterventionQueue[] }) {
  if (queues.length === 0) return null

  const total = queues.reduce((sum, queue) => sum + queue.count, 0)

  return (
    <Card className="overflow-hidden border-amber-200">
      <CardHeader className="border-b bg-amber-50/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-5 text-amber-600" />
          Needs your action
          <span className="ms-auto rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">
            {total}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Not filtered by date — this is the whole backlog, however old.
        </p>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {queues.map((queue) => {
          const meta = QUEUE_META[queue.key]
          const Icon = meta.icon
          const waiting = waitingDays(queue.oldestAt)
          return (
            <Link
              key={queue.key}
              href={queue.href}
              className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent sm:px-5"
            >
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${meta.tone}`}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  <span className="tabular-nums">{queue.count}</span> · {meta.label}
                  {waiting ? <span className="ms-2 text-xs font-normal text-amber-600">{waiting}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
                {queue.partners.length > 0 ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{queue.partners.join(" · ")}</p>
                ) : null}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
