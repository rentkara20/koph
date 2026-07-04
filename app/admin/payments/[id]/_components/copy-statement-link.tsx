"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"

// Copies the partner-facing statement magic link so ops can share it (WhatsApp,
// email) — the partner reviews line items before payment, killing disputes.
export function CopyStatementLink({ token }: { token: string }) {
  const t = useTranslations("payments")
  const [copied, setCopied] = useState(false)
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/statement/${token}`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success(t("statementLinkCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? <Check className="size-3.5 text-green-600" /> : <Link2 className="size-3.5" />}
      {t("copyStatementLink")}
    </Button>
  )
}
