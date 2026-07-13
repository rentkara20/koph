"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { qcAsset } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function QcButtons({ assetId }: { assetId: string }) {
  const t = useTranslations("procurement.pickup")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (pass: boolean) =>
    startTransition(async () => {
      const res = await qcAsset(assetId, pass)
      if (res.error) {
        toast.error(translateActionError(res.error))
        return
      }
      toast.success(t("qcDone"))
      router.refresh()
    })

  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(true)}>
        {t("qcPass")}
      </Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(false)}>
        {t("qcFail")}
      </Button>
    </div>
  )
}
