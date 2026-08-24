"use client"

// Ops correction for a line that arrived flagged as serialized but is really an
// accessory (or vice versa). POs minted from a sourcing case default every line
// to requiresSerial=true, which would otherwise make cables and adapters
// impossible to receive. Only offered while nothing has been received.

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { setPurchaseOrderLineRequiresSerial } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"

export function LineSerialModeToggle({
  purchaseOrderLineId,
  requiresSerial,
}: {
  purchaseOrderLineId: string
  requiresSerial: boolean
}) {
  const t = useTranslations("procurement")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setPurchaseOrderLineRequiresSerial({
        purchaseOrderLineId,
        requiresSerial: next,
      })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("serialModeUpdated"))
      router.refresh()
    })
  }

  return (
    <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={requiresSerial}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
      />
      {t("requiresSerial")}
    </label>
  )
}
