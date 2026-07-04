"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { holdPayment, releasePayment } from "@/lib/actions/payments"
import { Button } from "@/components/ui/button"

// Per-line hold/release: a disputed item is pulled out of the batch (on_hold)
// so the rest can be paid, then released back to pending for a later batch.
export function PaymentLineActions({
  paymentId,
  status,
  batchStatus,
}: {
  paymentId: string
  status: string
  batchStatus: string
}) {
  const t = useTranslations("payments")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Once a batch is paid, holds are meaningless
  if (batchStatus === "paid") {
    if (status === "on_hold") {
      return <span className="text-xs text-amber-700">{t("held")}</span>
    }
    return null
  }

  async function run(fn: () => Promise<{ error?: string }>, ok: string) {
    setLoading(true)
    try {
      const res = await fn()
      if (res.error) {
        toast.error(res.error)
        setLoading(false)
        return
      }
      toast.success(ok)
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  if (status === "on_hold") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => run(() => releasePayment(paymentId), tToast("updated"))}
      >
        {t("release")}
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-amber-700 hover:text-amber-800"
      disabled={loading}
      onClick={() => run(() => holdPayment(paymentId), tToast("updated"))}
    >
      {t("hold")}
    </Button>
  )
}
