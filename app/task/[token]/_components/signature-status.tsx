"use client"

import { CheckCircle2, Clock, ExternalLink, MessageCircle } from "lucide-react"
import { formatDate } from "@/lib/utils/format"

type Props = {
  status: string
  signedAt: number | null
  signerName: string | null
  signLink: string
  contactMobile: string | null
  customerName: string | null
  deliveryDate: number | null
}

export function SignatureStatus({
  status,
  signedAt,
  signerName,
  signLink,
  contactMobile,
  customerName,
  deliveryDate,
}: Props) {
  const isSigned = status === "signed"

  function buildWhatsAppUrl() {
    if (!contactMobile) return null
    const phone = contactMobile.replace(/\D/g, "")
    const lines = [
      `Hello${customerName ? ` ${customerName}` : ""},`,
      `Please sign the delivery document using the link below:`,
      signLink,
      deliveryDate ? `Delivery date: ${formatDate(deliveryDate)}` : null,
    ].filter(Boolean).join("\n")
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`
  }

  const waUrl = buildWhatsAppUrl()

  if (isSigned) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-semibold text-green-800">Document signed</p>
        </div>
        {signerName && (
          <p className="text-xs text-green-700 pl-6">Signed by <strong>{signerName}</strong></p>
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
            View signed document
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-800">Awaiting customer signature</p>
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
            Send via WhatsApp
          </a>
        )}
        <a
          href={signLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <ExternalLink className="size-3.5" />
          Open signing link
        </a>
      </div>
    </div>
  )
}
