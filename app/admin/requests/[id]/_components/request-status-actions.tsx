"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ChevronDown } from "lucide-react"
import { updateRequestStatus } from "@/lib/actions/requests"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

type ManualStatus = "on_hold" | "cancelled" | "rescheduled" | "failed"

const MANUAL_STATUSES: { value: ManualStatus; destructive?: boolean }[] = [
  { value: "on_hold" },
  { value: "rescheduled" },
  { value: "cancelled", destructive: true },
  { value: "failed", destructive: true },
]

export function RequestStatusActions({
  requestId,
  currentStatus,
}: {
  requestId: string
  currentStatus: string
}) {
  const t = useTranslations("requests")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleChange(status: ManualStatus) {
    setLoading(true)
    try {
      const result = await updateRequestStatus(requestId, status)
      if (result.error) {
        toast.error(result.error)
        setLoading(false)
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={loading}
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "gap-1.5 disabled:opacity-50"
        )}
      >
        {t("status." + currentStatus)}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Change status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MANUAL_STATUSES.map(({ value, destructive }) => (
          <DropdownMenuItem
            key={value}
            variant={destructive ? "destructive" : "default"}
            disabled={currentStatus === value}
            onClick={() => handleChange(value)}
          >
            {t(`status.${value}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
