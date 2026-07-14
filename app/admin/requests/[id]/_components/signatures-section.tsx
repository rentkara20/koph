"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Copy, Check, Send, X, FileText, Trash2, ShieldCheck, MessageCircle } from "lucide-react"
import {
  createSignatureRequest,
  markSignatureAsSent,
  cancelSignatureRequest,
  deleteSignatureRequest,
  requestAuthorizedSignoff,
} from "@/lib/actions/signatures"
import { buildWhatsappUrl, signLinkMessage, authorizedSignoffMessage, signLink } from "@/lib/utils/whatsapp"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"
import { translateActionError } from "@/lib/i18n/action-errors"
import { DeliveryProofActions } from "./delivery-proof-actions"

type StatusVariant = "outline" | "info" | "success" | "secondary"

const SIG_STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: "outline",
  sent: "info",
  opened: "info",
  otp_verified: "info",
  signed: "success",
  rejected: "secondary",
  expired: "secondary",
  cancelled: "secondary",
}

const SIG_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  opened: "Opened",
  otp_verified: "OTP Verified",
  signed: "Signed",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
}

type SigRow = {
  id: string
  documentName: string
  status: string
  secureToken: string
  requireNationalId: boolean
  createdAt: number
  signatoryRole: string
  parentSignatureRequestId: string | null
  signerName: string | null
  signedAt: number | null
  signatureMethod?: string | null
  uploadedFileUrl?: string | null
  approvedAt?: number | null
  reviewNotes?: string | null
}

type WhatsappContact = { name: string; mobile: string | null; email?: string | null } | null

function CopySignLink({ token, baseUrl }: { token: string; baseUrl: string }) {
  const tToast = useTranslations("toast")
  const [copied, setCopied] = useState(false)
  const url = `${baseUrl}/sign/${token}`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success(tToast("linkCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy signing link"}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  )
}

const ACTIVE_STATUSES = ["draft", "sent", "opened", "otp_verified"]

export function SignaturesSection({
  requestId,
  requestNumber,
  signatures,
  defaultRequireNationalId,
  receiverContact,
  authorizedContact,
  defaultDocumentName,
  baseUrl,
  customerName,
  receiverEmail,
  itemsSummary,
}: {
  requestId: string
  requestNumber: string
  signatures: SigRow[]
  defaultRequireNationalId: boolean
  receiverContact: WhatsappContact
  authorizedContact: WhatsappContact
  defaultDocumentName?: string
  baseUrl: string
  customerName: string | null
  receiverEmail: string | null
  itemsSummary: string
}) {
  const hasAuthorizedContact = !!authorizedContact
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  async function handleRequestAuthorized(id: string) {
    setRequestingId(id)
    try {
      const result = await requestAuthorizedSignoff(id)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("saved"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    } finally {
      setRequestingId(null)
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const fd = new FormData(e.currentTarget)
      const result = await createSignatureRequest(requestId, {
        documentName: fd.get("documentName") as string,
        requireNationalId: fd.get("requireNationalId") === "on",
      })
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("signatureSent"))
      setShowForm(false)
      router.refresh()
    } catch {
      setError("Unexpected error")
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  async function handleMarkSent(id: string) {
    try {
      const result = await markSignatureAsSent(id)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("signatureSent"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  async function handleCancel(id: string) {
    try {
      const result = await cancelSignatureRequest(id)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("signatureCancelled"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  async function handleDelete(id: string) {
    try {
      const result = await deleteSignatureRequest(id)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("deleted"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  return (
    <div className="space-y-4">
      {signatures.length === 0 ? (
        <p className="text-sm text-muted-foreground">No signature requests yet.</p>
      ) : (
        <div className="space-y-3">
          {signatures.map((sig) => {
            const isActive = ACTIVE_STATUSES.includes(sig.status)
            const isAuthorizedRow = sig.signatoryRole === "authorized"
            const hasStage2 = signatures.some((s) => s.parentSignatureRequestId === sig.id)
            // Offer authorised sign-off on a signed receiver request when the
            // customer has a flagged signatory and no stage-2 exists yet.
            const canRequestAuthorized =
              !isAuthorizedRow && sig.status === "signed" && hasAuthorizedContact && !hasStage2

            // WhatsApp: send the sign link to the receiver, or — for the
            // authorised-signatory stage — name the actual receiver + delivery
            // date so the signatory knows who they're co-signing after.
            const parentReceiver = isAuthorizedRow
              ? signatures.find((s) => s.id === sig.parentSignatureRequestId) ?? null
              : null
            const whatsappUrl = !isActive
              ? null
              : isAuthorizedRow
                ? buildWhatsappUrl(
                    authorizedContact?.mobile,
                    authorizedSignoffMessage({
                      authorizedName: authorizedContact?.name ?? null,
                      receiverName: parentReceiver?.signerName ?? "-",
                      requestNumber,
                      deliveredDate: parentReceiver?.signedAt ? formatDate(parentReceiver.signedAt) : "-",
                      signLink: signLink(sig.secureToken),
                    })
                  )
                : buildWhatsappUrl(
                    receiverContact?.mobile,
                    signLinkMessage({
                      customerName: receiverContact?.name ?? null,
                      requestNumber,
                      signLink: signLink(sig.secureToken),
                    })
                  )
            return (
              <div key={sig.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{sig.documentName}</p>
                      {isAuthorizedRow && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-kara-purple/10 px-1.5 py-0.5 text-[10px] font-semibold text-kara-purple">
                          <ShieldCheck className="size-3" />
                          Authorised signatory
                        </span>
                      )}
                    </div>
                    {sig.requireNationalId && (
                      <p className="text-xs text-muted-foreground mt-0.5">Requires National ID</p>
                    )}
                  </div>
                  <Badge variant={SIG_STATUS_VARIANT[sig.status] ?? "outline"}>
                    {SIG_STATUS_LABEL[sig.status] ?? sig.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {isActive && <CopySignLink token={sig.secureToken} baseUrl={baseUrl} />}

                  {isActive && whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <MessageCircle className="size-3" />
                      WhatsApp
                    </a>
                  )}

                  {sig.status === "signed" && (
                    <a
                      href={`/sign/${sig.secureToken}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <FileText className="size-3" />
                      Delivery note
                    </a>
                  )}

                  {canRequestAuthorized && (
                    <button
                      onClick={() => handleRequestAuthorized(sig.id)}
                      disabled={requestingId === sig.id}
                      className="inline-flex items-center gap-1 text-xs font-medium text-kara-purple hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      <ShieldCheck className="size-3" />
                      {requestingId === sig.id ? "…" : "Request authorised sign-off"}
                    </button>
                  )}

                  {sig.status === "draft" && (
                    <button
                      onClick={() => handleMarkSent(sig.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Send className="size-3" />
                      Mark as sent
                    </button>
                  )}

                  {isActive && (
                    <button
                      onClick={() => handleCancel(sig.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="size-3" />
                      Cancel
                    </button>
                  )}

                  {/* Delete */}
                  {confirmDeleteId === sig.id ? (
                    <span className="inline-flex items-center gap-1.5 text-xs ml-auto">
                      <span className="text-muted-foreground">Delete?</span>
                      <button
                        onClick={() => handleDelete(sig.id)}
                        className="text-destructive hover:underline font-medium"
                      >Yes</button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >No</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(sig.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  )}

                  <span className="text-xs text-muted-foreground">
                    {formatDate(sig.createdAt)}
                  </span>
                </div>

                {/* Delivery-proof channels + OTP + manual return (receiver rows only) */}
                {!isAuthorizedRow && (
                  <DeliveryProofActions
                    signatureRequestId={sig.id}
                    requestId={requestId}
                    secureToken={sig.secureToken}
                    status={sig.status}
                    requestNumber={requestNumber}
                    baseUrl={baseUrl}
                    itemsSummary={itemsSummary}
                    customerName={customerName ?? receiverContact?.name ?? null}
                    recipientMobile={receiverContact?.mobile ?? null}
                    recipientEmail={receiverEmail}
                    manual={
                      sig.signatureMethod === "manual_upload"
                        ? {
                            hasUpload: !!sig.uploadedFileUrl,
                            approved: !!sig.approvedAt,
                            fileUrl: sig.uploadedFileUrl ?? null,
                            reviewNotes: sig.reviewNotes ?? null,
                          }
                        : null
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div>
        {!showForm ? (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" />
            New signature request
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">New signature request</p>
            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs">
                Document name <span className="text-destructive">*</span>
              </Label>
              <Input
                name="documentName"
                required
                defaultValue={defaultDocumentName}
                placeholder="e.g. Rental agreement, Service authorization"
                autoFocus
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="requireNationalId"
                defaultChecked={defaultRequireNationalId}
                className="h-4 w-4"
              />
              <span className="text-sm">Require National ID / Iqama</span>
            </label>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                  setError("")
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
