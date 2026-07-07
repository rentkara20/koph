"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { KeyRound, Loader2, UserCheck, Link as LinkIcon, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createPartnerLogin, generatePartnerActivationLink, resetPartnerPassword } from "@/lib/actions/partners"
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

  const [showManual, setShowManual] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)
  const [activationLink, setActivationLink] = useState("")

  const [newPassword, setNewPassword] = useState("")
  const [resetLoading, setResetLoading] = useState(false)

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

  async function handleGenerateLink() {
    setLinkLoading(true)
    const result = await generatePartnerActivationLink(partnerId)
    setLinkLoading(false)
    if (result.error || !result.link) {
      toast.error(translateActionError(result.error ?? "Unauthorized"))
      return
    }
    setActivationLink(result.link)
    toast.success(t("linkGenerated"))
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(activationLink)
    toast.success(t("linkCopied"))
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    const result = await resetPartnerPassword(partnerId, newPassword)
    setResetLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(t("resetSuccess"))
    setNewPassword("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <KeyRound className="size-4 text-kara-purple" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkedEmail ? (
          <>
            <p className="flex items-center gap-2 text-sm">
              <UserCheck className="size-4 text-kara-blue" aria-hidden />
              {t("linked")}: <strong dir="ltr">{linkedEmail}</strong>
            </p>
            <form onSubmit={handleResetPassword} className="flex flex-wrap items-end gap-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="pl-new-password">{t("newPassword")}</Label>
                <Input
                  id="pl-new-password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  dir="ltr"
                  className="w-44 font-mono"
                />
              </div>
              <Button type="submit" variant="outline" disabled={resetLoading || newPassword.length < 8}>
                {resetLoading && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("resetSubmit")}
              </Button>
              <p className="w-full text-xs text-muted-foreground">{t("resetPasswordHint")}</p>
            </form>
          </>
        ) : (
          <>
            {activationLink ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="break-all font-mono text-xs" dir="ltr">{activationLink}</p>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={handleCopyLink}>
                    <Copy className="size-3.5" aria-hidden />
                    {t("copyLink")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={handleGenerateLink} disabled={linkLoading}>
                {linkLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LinkIcon className="size-4" aria-hidden />}
                {t("generateLink")}
              </Button>
            )}

            {!showManual && !activationLink && (
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="block text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {t("create")}
              </button>
            )}

            {showManual && (
              <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t pt-4">
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
          </>
        )}
      </CardContent>
    </Card>
  )
}
