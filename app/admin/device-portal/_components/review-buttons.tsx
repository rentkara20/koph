"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { reviewDeviceServiceRequest } from "@/lib/actions/device-portal"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ReviewButtons({ id }: { id: string }) {
  const t = useTranslations("devicePortalAdmin")
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState<"applied" | "rejected" | null>(null)

  async function decide(decision: "applied" | "rejected") {
    setError("")
    setLoading(decision)
    const result = await reviewDeviceServiceRequest(id, decision, note || undefined)
    setLoading(null)
    if (result?.error) {
      setError(translateActionError(result.error))
      return
    }
    router.refresh()
  }

  return (
    <div className="mt-4 grid gap-2 border-t pt-3">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("notePlaceholder")}
        maxLength={500}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide("applied")} disabled={loading !== null}>
          {loading === "applied" ? t("applying") : t("apply")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decide("rejected")}
          disabled={loading !== null}
        >
          {loading === "rejected" ? t("rejecting") : t("reject")}
        </Button>
      </div>
    </div>
  )
}
