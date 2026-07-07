"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { requestCallback } from "@/lib/actions/client-portal"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Kind = "return" | "extension" | "issue"
const KINDS: Kind[] = ["return", "extension", "issue"]

export function CallbackForm({
  token,
  requestOptions,
}: {
  token: string
  requestOptions: { id: string; label: string }[]
}) {
  const t = useTranslations("clientPortal")
  const [kind, setKind] = useState<Kind>("return")
  const [requestId, setRequestId] = useState(requestOptions[0]?.id ?? "")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    const result = await requestCallback(token, {
      kind,
      requestId: requestId || undefined,
      message: message.trim() || undefined,
    })
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    setSent(true)
    setMessage("")
  }

  if (sent) {
    return (
      <section className="rounded-xl border border-kara-blue/20 bg-kara-blue-soft px-4 py-4 text-sm font-medium text-kara-blue">
        {t("callbackSent")}
      </section>
    )
  }

  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">{t("callbackTitle")}</h2>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              kind === k
                ? "border-transparent bg-kara-purple text-white"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t(`callbackKinds.${k}`)}
          </button>
        ))}
      </div>

      {requestOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="callback-request">{t("relatedRequest")}</Label>
          <select
            id="callback-request"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          >
            {requestOptions.map((r) => (
              <option key={r.id} value={r.id} dir="ltr">
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="callback-message">{t("message")}</Label>
        <Textarea
          id="callback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
        />
      </div>

      <Button
        className="w-full bg-kara-purple hover:bg-kara-purple/90"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {t("submitCallback")}
      </Button>
    </section>
  )
}
