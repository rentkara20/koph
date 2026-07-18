"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { revokeAllOtherSessions } from "@/lib/actions/session-security"
import { Button } from "@/components/ui/button"

export function SessionSecurityPanel({ activeSessionCount }: { activeSessionCount: number }) {
  const router = useRouter()
  const t = useTranslations("sessionSecurityPage")
  const tToast = useTranslations("toast")
  const tCommon = useTranslations("common")
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRevoke() {
    setLoading(true)
    try {
      const result = await revokeAllOtherSessions()
      if (result.error) {
        toast.error(result.error)
      } else {
        const revoked = result.revoked ?? 0
        toast.success(
          t(revoked === 1 ? "signedOutResult" : "signedOutResultPlural", { count: revoked })
        )
        router.refresh()
      }
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(activeSessionCount === 1 ? "activeSessions" : "activeSessionsPlural", {
          count: activeSessionCount,
        })}
      </p>
      {!confirming ? (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          {t("signOutAllOthers")}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("confirmSignOutBody")}</span>
          <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={loading}>
            {loading ? t("signingOut") : t("confirm")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
            {tCommon("cancel")}
          </Button>
        </div>
      )}
    </div>
  )
}
