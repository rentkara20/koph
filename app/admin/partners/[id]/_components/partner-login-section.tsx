"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { KeyRound, Loader2, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createPartnerLogin } from "@/lib/actions/partners"
import { translateActionError } from "@/lib/i18n/action-errors"

export function PartnerLoginSection({
  partnerId,
  linkedEmail,
}: {
  partnerId: string
  linkedEmail: string | null
}) {
  const t = useTranslations("partners.login")
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await createPartnerLogin(partnerId, email, password)
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(t("created"))
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <KeyRound className="size-4 text-kara-purple" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {linkedEmail ? (
          <p className="flex items-center gap-2 text-sm">
            <UserCheck className="size-4 text-kara-blue" aria-hidden />
            {t("linked")}: <strong dir="ltr">{linkedEmail}</strong>
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl-email">{t("email")}</Label>
              <Input
                id="pl-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                className="w-56"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-password">{t("password")}</Label>
              <Input
                id="pl-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                dir="ltr"
                className="w-44 font-mono"
              />
            </div>
            <Button type="submit" disabled={loading || !email || password.length < 8}>
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("create")}
            </Button>
            <p className="w-full text-xs text-muted-foreground">{t("hint")}</p>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
