"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Copy, Check } from "lucide-react"

export function CopyTextButton({ value, className = "" }: { value: string; className?: string }) {
  const t = useTranslations("common")
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? t("copied") : t("copy")}
      aria-label={copied ? t("copied") : t("copy")}
      className={`inline-flex shrink-0 align-middle text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}
