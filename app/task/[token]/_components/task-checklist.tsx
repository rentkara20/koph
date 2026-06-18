"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { toggleTaskServiceByToken } from "@/lib/actions/task-services"

type ServiceItem = {
  id: string
  nameEn: string
  nameAr: string
  isCompleted: boolean
}

export function TaskChecklist({
  token,
  services,
}: {
  token: string
  services: ServiceItem[]
}) {
  const [items, setItems] = useState(services)
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(taskServiceId: string) {
    setPending(taskServiceId)
    const result = await toggleTaskServiceByToken(token, taskServiceId)
    setPending(null)
    if (result.error) return
    setItems((prev) =>
      prev.map((it) =>
        it.id === taskServiceId
          ? { ...it, isCompleted: result.isCompleted ?? !it.isCompleted }
          : it
      )
    )
  }

  const completed = items.filter((it) => it.isCompleted).length

  return (
    <div className="rounded-xl bg-background border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <p className="text-sm font-medium">Service checklist</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {completed}/{items.length}
        </span>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => toggle(item.id)}
              disabled={pending !== null}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20 disabled:opacity-60"
            >
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  item.isCompleted
                    ? "bg-green-600 border-green-600"
                    : "border-muted-foreground",
                ].join(" ")}
              >
                {item.isCompleted && <Check className="size-3 text-white" strokeWidth={3} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={["text-sm block", item.isCompleted ? "line-through text-muted-foreground" : ""].join(" ")}>
                  {item.nameEn}
                </span>
                {item.nameAr && (
                  <span className={["text-xs block mt-0.5", item.isCompleted ? "line-through text-muted-foreground" : "text-muted-foreground"].join(" ")} dir="rtl">
                    {item.nameAr}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
