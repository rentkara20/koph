"use client"

import { useTranslations } from "next-intl"
import { CheckCircle2, Clock, ExternalLink, MessageCircle } from "lucide-react"
import { formatDate } from "@/lib/utils/format"
import { buildWhatsappUrl, signLinkMessage } from "@/lib/utils/whatsapp"

type Props = {
  status: string
  signedAt: number | null
  signerName: string | null
  signLink: string
  contactMobile: string | null
  customerName: string | null
  requestNumber: string
  deliveryDate: number | null
}

export function SignatureStatus({
  status,
  signedAt,
  signerName,
  signLink,
  contactMobile,
  customerName,
  requestNumber,
}: Props) {
  const t = useTranslations("portal")
  const isSigned = status === "signed"

  const waUrl = buildWhatsappUrl(
    contactMobile,
    signLinkMessage({ customerName, requestNumber, signLink })
  )

  if (isSigned) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-semibold text-green-800">{t("documentSigned")}</p>
        </div>
        {signerName && (
          <p className="text-xs text-green-700 pl-6">{t("signedByName", { name: signerName })}</p>
        )}
        {signedAt && (
          <p className="text-xs text-green-700 pl-6">{formatDate(signedAt)}</p>
        )}
        <div className="pl-6 pt-1">
          <a
            href={signLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-green-700 underline underline-offset-2"
          >
            <ExternalLink className="size-3" />
            {t("viewSignedDoc")}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-800">{t("awaitingSignature")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            <MessageCircle className="size-3.5" />
            {t("sendViaWhatsapp")}
          </a>
        )}
        <a
          href={signLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <ExternalLink className="size-3.5" />
          {t("openSignLink")}
        </a>
      </div>
    </div>
  )
}
