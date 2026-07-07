"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"
import { resumeRequest } from "@/lib/actions/requests"
import { Button } from "@/components/ui/button"
import { translateActionError } from "@/lib/i18n/action-errors"

const REOPENABLE = ["on_hold", "rescheduled", "failed", "cancelled"]

export function ReopenRequestButton({ requestId, currentStatus }: { requestId: string; currentStatus: string }) {
  const t = useTranslations("requests")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (!REOPENABLE.includes(currentStatus)) return null

  async function handleClick() {
    setLoading(true)
    try {
      const result = await resumeRequest(requestId)
      if (result.error) {
        toast.error(translateActionError(result.error))
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
    <Button type="button" variant="outline" onClick={handleClick} disabled={loading}>
      <RotateCcw className="size-3.5" />
      {t("reopen")}
    </Button>
  )
}
