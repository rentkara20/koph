"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Link2, Loader2 } from "lucide-react"
import { getOrCreatePortalLink } from "@/lib/actions/client-portal"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"

// Mints (or reuses) the customer's magic-link portal and copies it — ops
// share this over WhatsApp so the customer can self-serve their device list.
export function PortalLinkButton({ customerId }: { customerId: string }) {
  const t = useTranslations("clientPortal")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await getOrCreatePortalLink(customerId)
    setLoading(false)
    if (result.error || !result.url) {
      toast.error(translateActionError(result.error ?? "Unauthorized"))
      return
    }
    const full = `${window.location.origin}${result.url}`
    await navigator.clipboard.writeText(full)
    setCopied(true)
    toast.success(t("linkCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading} className="gap-1.5">
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : copied ? (
        <Check className="size-3.5 text-green-600" aria-hidden />
      ) : (
        <Link2 className="size-3.5" aria-hidden />
      )}
      {t("portalLink")}
    </Button>
  )
}
