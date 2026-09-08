"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { activateDevice } from "@/lib/actions/device-portal"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Activation = the holder claims the device. Used both for a first claim and
 * for a transfer between two of the customer's own employees (KARA is not in
 * that loop, but every transfer is recorded and admins are notified).
 */
export function ActivateForm({ serial, transfer = false }: { serial: string; transfer?: boolean }) {
  const t = useTranslations("devicePortal.activation")
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const [consent, setConsent] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!consent) {
      setError(t("consentRequired"))
      return
    }
    setLoading(true)
    const result = await activateDevice(serial, {
      name,
      email,
      mobile,
      consent: true,
      reason: transfer ? reason || undefined : undefined,
    })
    setLoading(false)
    if (result?.error) {
      setError(translateActionError(result.error))
      return
    }
    router.push(`/d/${encodeURIComponent(serial)}/services`)
  }

  const body = (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="dp-name">{t("name")}</Label>
        <Input
          id="dp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="dp-email">{t("email")}</Label>
        <Input
          id="dp-email"
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={120}
          autoComplete="email"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="dp-mobile">{t("mobile")}</Label>
        <Input
          id="dp-mobile"
          type="tel"
          dir="ltr"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          required
          minLength={9}
          maxLength={20}
          autoComplete="tel"
          placeholder="05XXXXXXXX"
        />
      </div>

      {transfer && (
        <div className="grid gap-1.5">
          <Label htmlFor="dp-reason">{t("reason")}</Label>
          <Input
            id="dp-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
          />
        </div>
      )}

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>{t("consent")}</span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? t("submitting") : transfer ? t("submitTransfer") : t("submit")}
      </Button>
    </form>
  )

  if (transfer) return body

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
