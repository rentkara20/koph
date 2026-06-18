"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Copy, Check } from "lucide-react"

export function CopyButton({ value }: { value: string }) {
  const t = useTranslations("common")
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? t("copied") : t("copy")}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}
