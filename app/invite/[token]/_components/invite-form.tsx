"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { acceptInvite } from "@/lib/actions/user-invites"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function InviteForm({
  token,
  name,
  email,
  isReset,
}: {
  token: string
  name: string
  email: string
  isReset: boolean
}) {
  const t = useTranslations("invite")
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password !== confirm) {
      setError(t("mismatch"))
      return
    }
    setLoading(true)
    const result = await acceptInvite(token, password)
    setLoading(false)
    if (result.error) {
      setError(translateActionError(result.error))
      return
    }
    setDone(true)
    setTimeout(() => router.push("/login"), 1500)
  }

  if (done) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">{t("success")}</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{isReset ? t("resetTitle") : t("title")}</CardTitle>
        <CardDescription>
          {isReset ? t("resetSubtitle", { name }) : t("subtitle", { name })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">{t("email")}</Label>
            <Input id="inv-email" type="email" dir="ltr" value={email} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-password">{t("password")}</Label>
            <Input
              id="inv-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-confirm">{t("confirmPassword")}</Label>
            <Input
              id="inv-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={10}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
