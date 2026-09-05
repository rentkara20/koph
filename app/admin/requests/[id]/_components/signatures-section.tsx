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
import { buildWhatsappUrlWithLink, signLink } from "@/lib/utils/whatsapp"
import { renderMessageTemplate } from "@/lib/domain/message-templates"
import { useOperationalMessageTemplates } from "@/components/message-templates-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"
import { localizeDocumentName } from "@/lib/utils/document-name"
import { translateActionError } from "@/lib/i18n/action-errors"
import { DeliveryProofActions } from "./delivery-proof-actions"
import {
  DEFAULT_DEPOSIT_CURRENCY,
  DEFAULT_DEPOSIT_TITLE,
  type DepositNote,
  type DepositSettlement,
} from "@/lib/domain/deposit-note"
import { Select } from "@/components/ui/select"
import type { DepositDefaultLine } from "@/lib/actions/signatures"

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

const SIG_STATUS_KEY = {
  draft: "status.draft",
  sent: "status.sent",
  opened: "status.opened",
  otp_verified: "status.otp_verified",
  signed: "status.signed",
  rejected: "status.rejected",
  expired: "status.expired",
  cancelled: "status.cancelled",
} as const

function signatureStatusKey(status: string) {
  return SIG_STATUS_KEY[status as keyof typeof SIG_STATUS_KEY]
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
  customerAbsenceReason?: string | null
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
  const t = useTranslations("signatures")
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
      title={copied ? t("linkCopied") : t("copyLink")}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
      {copied ? t("linkCopied") : t("copyLink")}
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
  depositDefaults,
  requestTypeSlug,
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
  depositDefaults: DepositDefaultLine[]
  requestTypeSlug: string | null
}) {
  const messageTemplates = useOperationalMessageTemplates()
  const hasAuthorizedContact = !!authorizedContact
  const router = useRouter()
  const t = useTranslations("signatures")
  const tKind = useTranslations("signatures.documentKind")
  const tToast = useTranslations("toast")
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  // Opt-in per-device deposit block. Default OFF — when off, the delivery note
  // stays exactly as today and nothing is stored.
  const [depositEnabled, setDepositEnabled] = useState(false)
  const [depositTitle, setDepositTitle] = useState(DEFAULT_DEPOSIT_TITLE)
  const [depositShowRefundTerms, setDepositShowRefundTerms] = useState(true)
  const [depositNoteText, setDepositNoteText] = useState("")
  const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(depositDefaults.map((d) => [d.itemId, String(d.amount ?? 0)]))
  )
  // Settling the deposit only makes sense on the way back in — on a delivery
  // the money has just been taken and there is nothing to settle yet.
  const isCollection = requestTypeSlug === "collection"
  const [depositSettlement, setDepositSettlement] = useState<DepositSettlement>("pending_refund")
  const [depositSettlementNote, setDepositSettlementNote] = useState("")

  const depositTotal = depositDefaults.reduce(
    (sum, d) => sum + (Number(depositAmounts[d.itemId]) || 0),
    0
  )

  function buildDepositNote(): DepositNote | undefined {
    if (!depositEnabled) return undefined
    return {
      version: 1,
      enabled: true,
      currency: DEFAULT_DEPOSIT_CURRENCY,
      title: depositTitle.trim() || DEFAULT_DEPOSIT_TITLE,
      showTotal: true,
      showRefundTerms: depositShowRefundTerms,
      lines: depositDefaults.map((d) => ({
        itemId: d.itemId,
        label: d.label,
        amount: Number(depositAmounts[d.itemId]) || 0,
      })),
      note: depositNoteText.trim() || null,
      // A refund/retention is an event with a date; "still owed" is not, so it
      // carries no timestamp. Stamped at build time so the value freezes into
      // the signing snapshot alongside the amounts.
      settlement: isCollection ? depositSettlement : null,
      settledAt: isCollection && depositSettlement !== "pending_refund" ? Date.now() : null,
      settlementNote: isCollection ? depositSettlementNote.trim() || null : null,
    }
  }

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
        depositNote: buildDepositNote(),
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
      setError(t("unexpectedError"))
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
        <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
      ) : (
        <div className="space-y-3">
          {signatures.map((sig) => {
            const isActive = ACTIVE_STATUSES.includes(sig.status)
            const isAuthorizedRow = sig.signatoryRole === "authorized"
            // Kara's own rep countersigning a collection — a stage-2 row, but
            // OUR side of the table, so it is never messaged to the customer.
            const isAgentRow = sig.signatoryRole === "kara_agent"
            const isCountersignRow = isAuthorizedRow || isAgentRow
            // Scoped by role: a collection auto-opens the rep's stage, and that
            // must not read as "the authorised signatory was already asked".
            const hasAuthorizedStage2 = signatures.some(
              (s) => s.parentSignatureRequestId === sig.id && s.signatoryRole === "authorized"
            )
            // Offer authorised sign-off on a signed receiver request when the
            // customer has a flagged signatory and no stage-2 exists yet.
            const canRequestAuthorized =
              !isCountersignRow && sig.status === "signed" && hasAuthorizedContact && !hasAuthorizedStage2

            // WhatsApp: send the sign link to the receiver, or — for the
            // authorised-signatory stage — name the actual receiver + delivery
            // date so the signatory knows who they're co-signing after.
            const parentReceiver = isAuthorizedRow
              ? signatures.find((s) => s.id === sig.parentSignatureRequestId) ?? null
              : null
            const whatsappUrl = !isActive || isAgentRow
              ? null
              : isAuthorizedRow
                ? buildWhatsappUrlWithLink(
                    authorizedContact?.mobile,
                    signLink(sig.secureToken),
                    (link) =>
                      renderMessageTemplate(messageTemplates.authorizedSignoff, {
                        customer_name: authorizedContact?.name ?? "",
                        receiver_name: parentReceiver?.signerName ?? "-",
                        request_number: requestNumber,
                        delivery_date: parentReceiver?.signedAt ? formatDate(parentReceiver.signedAt) : "-",
                        sign_link: link,
                      })
                  )
                : buildWhatsappUrlWithLink(
                    receiverContact?.mobile,
                    signLink(sig.secureToken),
                    (link) =>
                      renderMessageTemplate(messageTemplates.signatureRequest, {
                        customer_name: receiverContact?.name ?? "",
                        request_number: requestNumber,
                        sign_link: link,
                      })
                  )
            return (
              <div key={sig.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{localizeDocumentName(sig.documentName, tKind)}</p>
                      {isAuthorizedRow && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-kara-purple/10 px-1.5 py-0.5 text-[10px] font-semibold text-kara-purple">
                          <ShieldCheck className="size-3" />
                          {t("authorizedSignatory")}
                        </span>
                      )}
                      {isAgentRow && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-kara-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-kara-blue">
                          <ShieldCheck className="size-3" />
                          {t("karaAgentSignature")}
                        </span>
                      )}
                    </div>
                    {/* One-sided receipt. Loud on purpose: this is the row that
                        tells the admin no customer ever signed, and that
                        releasing payment on it is their own call. */}
                    {sig.customerAbsenceReason && (
                      <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                        <span className="font-semibold">{t("agentOnlyReceipt")}</span>{" — "}
                        {sig.customerAbsenceReason}
                      </p>
                    )}
                    {sig.requireNationalId && (
                      <p className="text-xs text-muted-foreground mt-0.5">{t("requiresNationalId")}</p>
                    )}
                  </div>
                  <Badge variant={SIG_STATUS_VARIANT[sig.status] ?? "outline"}>
                    {signatureStatusKey(sig.status) ? t(signatureStatusKey(sig.status)!) : sig.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {isActive && <CopySignLink token={sig.secureToken} baseUrl={baseUrl} />}

                  {isActive && whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Sending via WhatsApp IS the send — activate a draft link
                      // automatically so the recipient never lands on a dead page.
                      onClick={() => { if (sig.status === "draft") void handleMarkSent(sig.id) }}
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
                      {t("deliveryNote")}
                    </a>
                  )}

                  {canRequestAuthorized && (
                    <button
                      onClick={() => handleRequestAuthorized(sig.id)}
                      disabled={requestingId === sig.id}
                      className="inline-flex items-center gap-1 text-xs font-medium text-kara-purple hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      <ShieldCheck className="size-3" />
                      {requestingId === sig.id ? "…" : t("requestAuthorizedSignoff")}
                    </button>
                  )}

                  {sig.status === "draft" && (
                    <button
                      onClick={() => handleMarkSent(sig.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Send className="size-3" />
                      {t("markSent")}
                    </button>
                  )}

                  {isActive && (
                    <button
                      onClick={() => handleCancel(sig.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="size-3" />
                      {t("cancel")}
                    </button>
                  )}

                  {/* Delete */}
                  {confirmDeleteId === sig.id ? (
                    <span className="inline-flex items-center gap-1.5 text-xs ml-auto">
                      <span className="text-muted-foreground">{t("deletePrompt")}</span>
                      <button
                        onClick={() => handleDelete(sig.id)}
                        className="text-destructive hover:underline font-medium"
                      >{t("yes")}</button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >{t("no")}</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(sig.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
                    >
                      <Trash2 className="size-3" />
                      {t("delete")}
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
            {t("new")}
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">{t("new")}</p>
            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("documentName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                name="documentName"
                required
                defaultValue={defaultDocumentName}
                placeholder={t("documentNamePlaceholder")}
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
              <span className="text-sm">{t("requireNationalId")}</span>
            </label>

            <div className="rounded-md border p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={depositEnabled}
                  onChange={(e) => setDepositEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">{t("deposit.enable")}</span>
              </label>

              {depositEnabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("deposit.title")}</Label>
                    <Input
                      value={depositTitle}
                      onChange={(e) => setDepositTitle(e.target.value)}
                    />
                  </div>

                  {depositDefaults.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("deposit.noItems")}</p>
                  ) : (
                    <div className="space-y-2">
                      {depositDefaults.map((line) => (
                        <div key={line.itemId} className="flex items-center gap-2">
                          <span className="flex-1 text-xs truncate" title={line.label}>
                            {line.label}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={depositAmounts[line.itemId] ?? ""}
                            onChange={(e) =>
                              setDepositAmounts((prev) => ({ ...prev, [line.itemId]: e.target.value }))
                            }
                            className="w-28"
                          />
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                        <span>{t("deposit.total")}</span>
                        <span>
                          {depositTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                          {DEFAULT_DEPOSIT_CURRENCY}
                        </span>
                      </div>
                    </div>
                  )}

                  {isCollection && (
                    <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
                      <Label className="text-xs">{t("deposit.settlement.label")}</Label>
                      <Select
                        value={depositSettlement}
                        onChange={(e) =>
                          setDepositSettlement(e.target.value as DepositSettlement)
                        }
                      >
                        <option value="pending_refund">
                          {t("deposit.settlement.pendingRefund")}
                        </option>
                        <option value="refunded_outside">
                          {t("deposit.settlement.refundedOutside")}
                        </option>
                        <option value="retained">{t("deposit.settlement.retained")}</option>
                      </Select>
                      <Input
                        value={depositSettlementNote}
                        onChange={(e) => setDepositSettlementNote(e.target.value)}
                        placeholder={t("deposit.settlement.notePlaceholder")}
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={depositShowRefundTerms}
                      onChange={(e) => setDepositShowRefundTerms(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{t("deposit.showRefundTerms")}</span>
                  </label>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("deposit.note")}</Label>
                    <Input
                      value={depositNoteText}
                      onChange={(e) => setDepositNoteText(e.target.value)}
                      placeholder={t("deposit.notePlaceholder")}
                    />
                  </div>
                </div>
              )}
            </div>

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
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? t("creating") : t("create")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
