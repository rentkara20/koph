import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { Building2 } from "lucide-react"
import { getSignatureByToken, recordSignatureOpened } from "@/lib/actions/signatures"
import { getDeliveryNoteData } from "@/lib/actions/delivery-notes"
import { Badge } from "@/components/ui/badge"
import { SignatureForm } from "./_components/signature-form"
import { DeliveryNoteView } from "./_components/delivery-note-view"
import { DownloadButton } from "./_components/download-button"

type StatusVariant = "outline" | "info" | "success" | "secondary"

const STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: "outline",
  sent: "info",
  opened: "info",
  otp_verified: "info",
  signed: "success",
  rejected: "secondary",
  expired: "secondary",
  cancelled: "secondary",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Not active",
  sent: "Awaiting signature",
  opened: "Awaiting signature",
  otp_verified: "Awaiting signature",
  signed: "Signed",
  rejected: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [data, deliveryNote] = await Promise.all([
    getSignatureByToken(token),
    getDeliveryNoteData(token),
  ])

  if (!data) notFound()

  const { sig, activeConsent, isExpired } = data

  // Transition sent → opened
  if (sig.status === "sent") {
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined
    const ua = headersList.get("user-agent") ?? undefined
    await recordSignatureOpened(token, ip, ua)
  }

  const isTerminal = ["signed", "rejected", "expired", "cancelled"].includes(sig.status)
  const canSign = !isTerminal && !isExpired && sig.status !== "draft"
  const isSigned = sig.status === "signed"

  const consentText =
    activeConsent?.textEn ??
    "I confirm that the information provided is accurate and I agree to sign this document electronically. By submitting this form, I consent to the collection and processing of my personal data in accordance with applicable data protection regulations."

  return (
    <div className="min-h-svh bg-muted/30">
      {/* Header */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="flex items-center gap-2.5 px-4 py-3 max-w-2xl mx-auto">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
            <Building2 className="h-4 w-4 text-background" />
          </div>
          <span className="font-semibold text-sm">KOPH</span>
          <span className="text-muted-foreground text-sm mx-1">·</span>
          <span className="text-sm text-muted-foreground truncate">{sig.documentName}</span>
          <Badge
            variant={STATUS_VARIANT[sig.status] ?? "outline"}
            className="ml-auto shrink-0"
          >
            {STATUS_LABEL[sig.status] ?? sig.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Status banners */}
        {isExpired && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            This signing link has expired. Contact the operations team.
          </div>
        )}
        {sig.status === "draft" && !isExpired && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            This signing link is not active yet. Contact the operations team.
          </div>
        )}
        {sig.status === "cancelled" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            This signature request has been cancelled.
          </div>
        )}
        {sig.status === "rejected" && (
          <div className="rounded-lg bg-muted border px-4 py-3 text-sm text-muted-foreground">
            This document signing was declined.
          </div>
        )}

        {/* Signed — show delivery note with embedded signature + download */}
        {isSigned && deliveryNote && (
          <>
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              ✓ Document signed successfully. You can download your delivery note below.
            </div>
            <div className="space-y-3">
              <DeliveryNoteView data={deliveryNote} />
              <div className="flex justify-center pt-2">
                <DownloadButton token={token} />
              </div>
            </div>
          </>
        )}

        {/* Not yet signed — show delivery note (what they're receiving), then sign form */}
        {!isSigned && deliveryNote && (
          <>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Please review the items below before signing:
              </p>
              <DeliveryNoteView data={deliveryNote} />
            </div>

            {canSign && (
              <SignatureForm
                token={token}
                requireNationalId={sig.requireNationalId}
                documentName={sig.documentName}
                consentText={consentText}
              />
            )}
          </>
        )}

        {/* Fallback if no delivery note data */}
        {!deliveryNote && canSign && (
          <SignatureForm
            token={token}
            requireNationalId={sig.requireNationalId}
            documentName={sig.documentName}
            consentText={consentText}
          />
        )}
      </div>
    </div>
  )
}
