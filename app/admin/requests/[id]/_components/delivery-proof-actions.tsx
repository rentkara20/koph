"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { upload } from "@vercel/blob/client"
import { toast } from "sonner"
import {
  KeyRound,
  MessageCircle,
  Mail,
  Copy,
  Check,
  FileText,
  Upload,
  ChevronDown,
} from "lucide-react"
import { generateDeliveryOtp } from "@/lib/actions/otp"
import {
  uploadManualSignature,
  approveManualSignature,
  rejectManualSignature,
} from "@/lib/actions/signatures"
import { prepareCommunication, confirmCommunicationSent, cancelCommunication } from "@/lib/actions/communications"
import {
  buildMailtoUrl,
  buildOutlookComposeUrl,
  buildWhatsappUrl,
  otpDeliveryMessage,
  remoteSignatureMessage,
  signedReceiptMessage,
  otpDeliverySubject,
  remoteSignatureSubject,
  signedReceiptSubject,
  type CommMessageType,
} from "@/lib/utils/comms"
import { Button } from "@/components/ui/button"
import { translateActionError } from "@/lib/i18n/action-errors"

type ManualState = {
  hasUpload: boolean
  approved: boolean
  fileUrl: string | null
  reviewNotes: string | null
} | null

type Props = {
  signatureRequestId: string
  requestId: string
  secureToken: string
  status: string
  requestNumber: string
  baseUrl: string
  itemsSummary: string
  customerName: string | null
  recipientMobile: string | null
  recipientEmail: string | null
  manual: ManualState
}

const ACTIVE = ["draft", "sent", "opened", "otp_verified"]

export function DeliveryProofActions({
  signatureRequestId,
  requestId,
  secureToken,
  status,
  requestNumber,
  baseUrl,
  itemsSummary,
  customerName,
  recipientMobile,
  recipientEmail,
  manual,
}: Props) {
  const router = useRouter()
  const revalidate = `/admin/requests/${requestId}`
  const signLinkUrl = `${baseUrl}/sign/${secureToken}`
  const printUrl = `${baseUrl}/sign/${secureToken}/print`

  const [otp, setOtp] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSigned = status === "signed"
  const isActive = ACTIVE.includes(status)

  async function handleGenerateOtp() {
    setBusy(true)
    const res = await generateDeliveryOtp(signatureRequestId)
    setBusy(false)
    if (res.error) { toast.error(translateActionError(res.error)); return }
    setOtp(res.otp ?? null)
    router.refresh()
  }

  // The prepared message per phase. OTP is embedded only in the OTP-delivery
  // body (sent by hand) — never persisted to the communication log.
  function messageFor(type: CommMessageType): { subject: string; body: string } {
    if (type === "otp_delivery") {
      return {
        subject: otpDeliverySubject(requestNumber),
        body: otpDeliveryMessage({
          customerName,
          requestNumber,
          itemsSummary,
          otp: otp ?? "______",
          signLink: signLinkUrl,
        }),
      }
    }
    if (type === "remote_signature") {
      return {
        subject: remoteSignatureSubject(requestNumber),
        body: remoteSignatureMessage({ customerName, requestNumber, signLink: signLinkUrl }),
      }
    }
    return {
      subject: signedReceiptSubject(requestNumber),
      body: signedReceiptMessage({ customerName, requestNumber, receiptLink: printUrl }),
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2.5">
      {/* Pre-delivery: OTP generation + delivery message channels */}
      {isActive && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleGenerateOtp} disabled={busy}>
              <KeyRound className="size-3.5" />
              {busy ? "…" : otp ? "Regenerate OTP" : "Generate OTP"}
            </Button>
            {otp && (
              <span className="rounded-md bg-kara-purple/10 px-2 py-1 font-mono text-lg font-bold tracking-widest text-kara-purple">
                {otp}
              </span>
            )}
          </div>
          {otp && (
            <p className="text-[11px] text-muted-foreground">
              Shown once. Send it to the recipient; they give it to the courier. It is never stored.
            </p>
          )}
          <ChannelRow
            label="Send delivery code + link"
            messageType="otp_delivery"
            entityId={signatureRequestId}
            recipientMobile={recipientMobile}
            recipientEmail={recipientEmail}
            revalidate={revalidate}
            {...messageFor("otp_delivery")}
          />
        </div>
      )}

      {/* Signature pending (delivered, awaiting) — remote request + manual return */}
      {isActive && (
        <div className="space-y-2 border-t pt-2">
          <ChannelRow
            label="Request remote signature"
            messageType="remote_signature"
            entityId={signatureRequestId}
            recipientMobile={recipientMobile}
            recipientEmail={recipientEmail}
            revalidate={revalidate}
            {...messageFor("remote_signature")}
          />
          <a
            href={printUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <FileText className="size-3" />
            Open unsigned printable receipt
          </a>
          <ManualReturn signatureRequestId={signatureRequestId} manual={manual} />
        </div>
      )}

      {/* After delivery — signed receipt distribution */}
      {isSigned && (
        <div className="space-y-2">
          <a
            href={printUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <FileText className="size-3" />
            Print / Save as PDF
          </a>
          <ChannelRow
            label="Send signed receipt"
            messageType="signed_receipt"
            entityId={signatureRequestId}
            recipientMobile={recipientMobile}
            recipientEmail={recipientEmail}
            revalidate={revalidate}
            includeCopyLink={printUrl}
            {...messageFor("signed_receipt")}
          />
        </div>
      )}
    </div>
  )
}

// ─── Channel button row (WhatsApp / Outlook / Email app / Copy) ──────────────

function ChannelRow({
  label,
  subject,
  body,
  messageType,
  entityId,
  recipientMobile,
  recipientEmail,
  revalidate,
  includeCopyLink,
}: {
  label: string
  subject: string
  body: string
  messageType: CommMessageType
  entityId: string
  recipientMobile: string | null
  recipientEmail: string | null
  revalidate: string
  includeCopyLink?: string
}) {
  const [preparedId, setPreparedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const waUrl = buildWhatsappUrl(recipientMobile, body)
  const outlookUrl = recipientEmail ? buildOutlookComposeUrl(recipientEmail, subject, body) : null
  const mailtoUrl = recipientEmail ? buildMailtoUrl(recipientEmail, subject, body) : null

  async function record(channel: "whatsapp" | "outlook" | "mailto" | "copy", recipient: string | null) {
    const res = await prepareCommunication({
      entityType: "signature_request",
      entityId,
      channel,
      messageType,
      recipient,
      revalidate,
    })
    if (res.id) setPreparedId(res.id)
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(includeCopyLink ? `${body}` : body)
    setCopied(true)
    toast.success("Message copied")
    setTimeout(() => setCopied(false), 1500)
    record("copy", null)
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => record("whatsapp", recipientMobile)}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
          >
            <MessageCircle className="size-3" /> WhatsApp
          </a>
        )}
        {outlookUrl && (
          <a
            href={outlookUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => record("outlook", recipientEmail)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            <Mail className="size-3" /> Outlook
          </a>
        )}
        {mailtoUrl && (
          <a
            href={mailtoUrl}
            onClick={() => record("mailto", recipientEmail)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            <Mail className="size-3" /> Email app
          </a>
        )}
        <button
          onClick={copyMessage}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-muted"
        >
          {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
          Copy message
        </button>
      </div>
      {preparedId && <ConfirmSent id={preparedId} revalidate={revalidate} onDone={() => setPreparedId(null)} />}
    </div>
  )
}

function ConfirmSent({ id, revalidate, onDone }: { id: string; revalidate: string; onDone: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>Opened — not proof of send.</span>
      <button
        className="font-medium text-foreground hover:underline"
        onClick={async () => { await confirmCommunicationSent(id, revalidate); toast.success("Marked sent"); onDone() }}
      >
        Mark sent
      </button>
      <button
        className="hover:underline"
        onClick={async () => { await cancelCommunication(id, revalidate); onDone() }}
      >
        Cancel
      </button>
    </div>
  )
}

// ─── Manual returned signed file: upload → review → approve/reject ───────────

function ManualReturn({
  signatureRequestId,
  manual,
}: {
  signatureRequestId: string
  manual: ManualState
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fullName, setFullName] = useState("")
  const [notes, setNotes] = useState("")

  async function handleUpload(file: File) {
    setBusy(true)
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/signature-upload",
        clientPayload: JSON.stringify({ signatureRequestId }),
      })
      const res = await uploadManualSignature(signatureRequestId, {
        fileUrl: blob.url,
        fileName: file.name,
        fullName: fullName.trim() || "—",
      })
      if (res.error) { toast.error(translateActionError(res.error)); return }
      toast.success("File uploaded — pending review")
      router.refresh()
    } catch {
      toast.error("Upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove() {
    setBusy(true)
    const res = await approveManualSignature(signatureRequestId, { reviewNotes: notes.trim() || undefined })
    setBusy(false)
    if (res.error) { toast.error(translateActionError(res.error)); return }
    toast.success("Approved")
    router.refresh()
  }

  async function handleReject() {
    if (!notes.trim()) { toast.error("Enter a rejection reason"); return }
    setBusy(true)
    const res = await rejectManualSignature(signatureRequestId, { reviewNotes: notes.trim() })
    setBusy(false)
    if (res.error) { toast.error(translateActionError(res.error)); return }
    toast.success("Rejected")
    router.refresh()
  }

  const pendingReview = manual?.hasUpload && !manual.approved

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Upload className="size-3" />
        Upload signed file (manual return)
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-2 rounded-md border p-2">
          {!pendingReview && (
            <>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Signer name (from file)"
                className="w-full rounded border px-2 py-1 text-xs"
              />
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                className="block w-full text-xs"
              />
            </>
          )}

          {manual?.reviewNotes && (
            <p className="text-[11px] text-amber-700">Last review: {manual.reviewNotes}</p>
          )}

          {pendingReview && (
            <div className="space-y-2">
              {manual?.fileUrl && (
                <a href={manual.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-kara-purple hover:underline">
                  <FileText className="size-3" /> View uploaded file
                </a>
              )}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Review notes (required to reject)"
                className="w-full rounded border px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleApprove} disabled={busy}>Approve</Button>
                <Button size="sm" variant="outline" onClick={handleReject} disabled={busy}>Reject</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
