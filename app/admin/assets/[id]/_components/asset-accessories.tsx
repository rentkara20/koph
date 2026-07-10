"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { attachAccessory, updateAccessoryChecklist } from "@/lib/actions/accessories"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { AccessoryItem } from "@/lib/db/schema"

type Attached = {
  id: string
  nameEn: string
  serialNumber: string | null
  checklistState: "delivered" | "collected" | "missing" | "damaged"
}

const STATE_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  delivered: "default",
  collected: "success",
  missing: "destructive",
  damaged: "destructive",
}

export function AssetAccessories({
  assetId,
  attached,
  availableItems,
}: {
  assetId: string
  attached: Attached[]
  availableItems: AccessoryItem[]
}) {
  const t = useTranslations("accessories")
  const router = useRouter()
  const [itemId, setItemId] = useState(availableItems[0]?.id ?? "")
  const [pending, startTransition] = useTransition()

  function handleAttach() {
    if (!itemId) return
    startTransition(async () => {
      const result = await attachAccessory({ entityType: "asset", entityId: assetId, accessoryItemId: itemId, qty: 1 })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      router.refresh()
    })
  }

  function handleChecklist(attachmentId: string, checklistState: Attached["checklistState"]) {
    startTransition(async () => {
      const result = await updateAccessoryChecklist({ attachmentId, checklistState })
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{t("title")}</h2>

      {availableItems.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)} className="h-8 w-56">
            {availableItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nameEn}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={handleAttach} disabled={pending || !itemId}>
            {pending && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
            {t("attach")}
          </Button>
        </div>
      )}

      {attached.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAccessories")}</p>
      ) : (
        <ul className="space-y-2">
          {attached.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
              <span>
                {a.nameEn}
                {a.serialNumber && (
                  <span className="ms-1.5 font-mono text-xs text-muted-foreground" dir="ltr">
                    {a.serialNumber}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant={STATE_VARIANT[a.checklistState]}>{t(`checklistStates.${a.checklistState}`)}</Badge>
                {a.checklistState === "delivered" && (
                  <Button size="sm" variant="outline" onClick={() => handleChecklist(a.id, "collected")} disabled={pending}>
                    {t("checklistStates.collected")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
