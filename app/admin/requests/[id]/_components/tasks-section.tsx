"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Plus, Copy, Check, RefreshCw, X } from "lucide-react"
import { createTask, signOffTask, cancelTask, regenerateTaskLink } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"

const TASK_STATUS_VARIANT: Record<string, "outline" | "info" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "outline",
  accepted: "info",
  in_progress: "warning",
  pending_signoff: "warning",
  closed: "success",
  rejected: "destructive",
  failed: "destructive",
  cancelled: "secondary",
}

type TaskRow = {
  id: string
  taskToken: string
  taskTokenExpiresAt: number
  status: string
  notes: string | null
  failureReason: string | null
  failureNotes: string | null
  signoffQuantity: number | null
  assignedAt: number | null
  closedAt: number | null
  createdAt: number
  partnerId: string
  partnerName: string | null
  contractId: string | null
}

type PartnerData = {
  id: string
  name: string
  contracts: {
    partnerId: string
    partnerName: string
    contractId: string | null
    contractName: string | null
    pricingModel: string | null
    unitPrice: number | null
  }[]
}

function CopyTaskLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/task/${token}`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy task link"}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  )
}

function SignOffButton({ taskId, pricingModel }: { taskId: string; pricingModel: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState("")
  const [loading, setLoading] = useState(false)
  const needsQty = pricingModel === "per_day" || pricingModel === "per_hour" || pricingModel === "per_item"

  async function handleSignOff() {
    setLoading(true)
    await signOffTask(taskId, needsQty && qty ? parseInt(qty) : undefined)
    router.refresh()
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>Sign off</Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {needsQty && (
        <Input
          type="number"
          min={1}
          placeholder="Qty"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-7 w-20 text-xs"
        />
      )}
      <Button size="sm" disabled={loading} onClick={handleSignOff}>
        {loading ? "…" : "Confirm sign-off"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  )
}

export function TasksSection({
  requestId,
  tasks,
  partners,
}: {
  requestId: string
  tasks: TaskRow[]
  partners: PartnerData[]
}) {
  const t = useTranslations("tasks")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const selectedPartner = partners.find((p) => p.id === selectedPartnerId)

  async function handleAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const fd = new FormData(e.currentTarget)
      const result = await createTask(requestId, {
        partnerId: fd.get("partnerId") as string,
        contractId: (fd.get("contractId") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      })
      if (result.error) { setError(result.error); setLoading(false); return }
      setShowForm(false)
      setSelectedPartnerId("")
      router.refresh()
    } catch {
      setError("Unexpected error"); setLoading(false)
    }
  }

  async function handleCancel(taskId: string) {
    await cancelTask(taskId)
    router.refresh()
  }

  async function handleRegenerate(taskId: string) {
    await regenerateTaskLink(taskId)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Task list */}
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isExpired = task.taskTokenExpiresAt < Date.now()
            const isActive = ["pending", "accepted", "in_progress", "pending_signoff"].includes(task.status)
            return (
              <div key={task.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{task.partnerName ?? "—"}</p>
                    {task.notes && <p className="text-xs text-muted-foreground mt-0.5">{task.notes}</p>}
                  </div>
                  <Badge variant={TASK_STATUS_VARIANT[task.status] ?? "outline"}>
                    {t(`status.${task.status}`)}
                  </Badge>
                </div>

                {task.status === "failed" && task.failureReason && (
                  <p className="text-xs text-destructive">
                    {task.failureReason.replace(/_/g, " ")}
                    {task.failureNotes ? ` — ${task.failureNotes}` : ""}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {/* Copy link for active tasks */}
                  {isActive && !isExpired && (
                    <CopyTaskLink token={task.taskToken} />
                  )}

                  {/* Regenerate if expired and still in actionable state */}
                  {isExpired && isActive && (
                    <button
                      onClick={() => handleRegenerate(task.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RefreshCw className="size-3" />
                      Regenerate link
                    </button>
                  )}

                  {/* Sign off */}
                  {task.status === "pending_signoff" && (
                    <SignOffButton taskId={task.id} pricingModel={null} />
                  )}

                  {/* Cancel */}
                  {isActive && (
                    <button
                      onClick={() => handleCancel(task.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="size-3" />
                      Cancel
                    </button>
                  )}

                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDate(task.createdAt)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Assign form */}
      <div>
        {!showForm ? (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" />
            {t("assignTo")}
          </Button>
        ) : (
          <form onSubmit={handleAssign} className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Assign to partner</p>
            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs">Partner <span className="text-destructive">*</span></Label>
              <Select
                name="partnerId"
                required
                value={selectedPartnerId}
                onChange={(e) => setSelectedPartnerId(e.target.value)}
              >
                <option value="">— Select partner —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>

            {selectedPartner && selectedPartner.contracts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Contract <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Select name="contractId" defaultValue="">
                  <option value="">— No contract —</option>
                  {selectedPartner.contracts.map((c) => (
                    <option key={c.contractId} value={c.contractId!}>
                      {c.contractName} ({c.pricingModel?.replace(/_/g, " ")})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{tCommon("notes")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
              <Textarea name="notes" rows={2} placeholder="Instructions for the partner…" />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setSelectedPartnerId("") }}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? tCommon("loading") : t("assignTo")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
