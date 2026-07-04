"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Copy, Check, Send, X, FileText, Trash2 } from "lucide-react"
import {
  createSignatureRequest,
  markSignatureAsSent,
  cancelSignatureRequest,
  deleteSignatureRequest,
} from "@/lib/actions/signatures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"

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
}

function CopySignLink({ token }: { token: string }) {
  const tToast = useTranslations("toast")
  const [copied, setCopied] = useState(false)
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign/${token}`

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
  signatures,
  defaultRequireNationalId,
}: {
  requestId: string
  signatures: SigRow[]
  defaultRequireNationalId: boolean
}) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
        setError(result.error)
        toast.error(result.error)
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
      if (result.error) { toast.error(result.error); return }
      toast.success(tToast("signatureSent"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  async function handleCancel(id: string) {
    try {
      const result = await cancelSignatureRequest(id)
      if (result.error) { toast.error(result.error); return }
      toast.success(tToast("signatureCancelled"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  async function handleDelete(id: string) {
    try {
      const result = await deleteSignatureRequest(id)
      if (result.error) { toast.error(result.error); return }
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
            return (
              <div key={sig.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{sig.documentName}</p>
                    {sig.requireNationalId && (
                      <p className="text-xs text-muted-foreground mt-0.5">Requires National ID</p>
                    )}
                  </div>
                  <Badge variant={SIG_STATUS_VARIANT[sig.status] ?? "outline"}>
                    {SIG_STATUS_LABEL[sig.status] ?? sig.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {isActive && <CopySignLink token={sig.secureToken} />}

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
