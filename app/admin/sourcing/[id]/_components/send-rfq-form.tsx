"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { sendSupplierRfqs } from "@/lib/actions/sourcing"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { Supplier } from "@/lib/db/schema"

export function SendRfqForm({ sourcingRequestId, suppliers }: { sourcingRequestId: string; suppliers: Supplier[] }) {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await sendSupplierRfqs({ sourcingRequestId, supplierIds: selected })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("rfqsSent"))
      setSelected([])
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{t("sendRfq")}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {suppliers.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
            {s.name}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={pending || selected.length === 0} size="sm">
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("sendRfq")}
      </Button>
    </div>
  )
}
