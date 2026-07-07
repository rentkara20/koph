"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Ban, RotateCcw } from "lucide-react"
import { setOrderCancelled } from "@/lib/actions/orders"
import { Button } from "@/components/ui/button"
import { translateActionError } from "@/lib/i18n/action-errors"

export function CancelOrderButton({ orderId, isCancelled }: { orderId: string; isCancelled: boolean }) {
  const t = useTranslations("orders")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const result = await setOrderCancelled(orderId, !isCancelled)
      if (result.error) {
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("updated"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {isCancelled ? <RotateCcw className="size-3.5" /> : <Ban className="size-3.5" />}
      {isCancelled ? t("reopenOrder") : t("cancelOrder")}
    </Button>
  )
}
