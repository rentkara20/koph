"use client"

import { useTranslations } from "next-intl"
import { ShieldCheck } from "lucide-react"

/**
 * Trust band shown near the top of the signing page. Makes it obvious the link
 * is a legitimate KARA link, not a phishing attempt.
 */
export function TrustBand({ requestedBy }: { requestedBy?: string | null }) {
  const t = useTranslations("trust")

  return (
    <div className="flex items-start gap-3 rounded-xl border border-kara-blue/20 bg-kara-blue-soft px-4 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-kara-blue/15 text-kara-blue">
        <ShieldCheck className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-foreground">{t("secureLink")}</p>
        <p className="mt-0.5 text-muted-foreground">{t("secureNote")}</p>
        {requestedBy && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("requestedBy")}: <span className="font-medium text-foreground">{requestedBy}</span>
          </p>
        )}
      </div>
    </div>
  )
}
