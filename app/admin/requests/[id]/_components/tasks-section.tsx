"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Copy, Check, RefreshCw, X, Trash2, MessageCircle } from "lucide-react"
import { createTask, signOffTask, cancelTask, regenerateTaskLink, deleteTask, rejectTaskProof } from "@/lib/actions/tasks"
import { buildWhatsappUrl, partnerAssignmentMessage, taskLink } from "@/lib/utils/whatsapp"
import { addServiceToTask, removeServiceFromTask } from "@/lib/actions/task-services"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils/format"
import { translateActionError } from "@/lib/i18n/action-errors"

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
  partnerMobile: string | null
  executionMode: string
  contractId: string | null
  pricingModel: string | null
  unitPrice: number | null
  contactId: string | null
  contactName: string | null
  contactCity: string | null
}

type ContactOption = {
  id: string
  name: string
  role: string | null
  city: string | null
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

type ServiceItem = {
  id: string
  serviceId: string
  nameEn: string | null
  nameAr: string | null
  isCompleted: boolean
  completedAt: number | null
}

type ActiveService = {
  id: string
  nameEn: string
  nameAr: string
  isActive: boolean
  sortOrder: number
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

const QTY_LABEL: Record<string, string> = {
  per_item: "items",
  per_day: "days",
  per_hour: "hrs",
}

function SignOffButton({
  taskId,
  pricingModel,
  unitPrice,
  isOverride,
}: {
  taskId: string
  pricingModel: string | null
  unitPrice: number | null
  isOverride?: boolean
}) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState("")
  const [loading, setLoading] = useState(false)
  const needsQty = pricingModel === "per_day" || pricingModel === "per_hour" || pricingModel === "per_item"

  const parsedQty = qty ? parseFloat(qty) : null
  const total =
    unitPrice != null
      ? needsQty
        ? parsedQty != null && parsedQty > 0
          ? parsedQty * unitPrice
          : null
        : unitPrice
      : null

  async function handleSignOff() {
    setLoading(true)
    try {
      const result = await signOffTask(taskId, needsQty && qty ? parseInt(qty) : undefined)
      if (result?.error) {
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("taskSignedOff"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant={isOverride ? "outline" : "default"} onClick={() => setOpen(true)}>
        {isOverride ? "Force complete" : "Sign off"}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isOverride && (
        <span className="text-xs text-destructive">
          Task failed — marking complete will still generate payment.
        </span>
      )}
      {needsQty && (
        <Input
          type="number"
          min={1}
          placeholder={QTY_LABEL[pricingModel!] ?? "qty"}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-7 w-20 text-xs"
        />
      )}
      {total != null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          SAR {total.toFixed(2)}
        </span>
      )}
      <Button
        size="sm"
        disabled={loading || (needsQty && !qty)}
        onClick={handleSignOff}
      >
        {loading ? "…" : "Confirm"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  )
}

function RejectProofButton({ taskId }: { taskId: string }) {
  const router = useRouter()
  const t = useTranslations("tasks")
  const tToast = useTranslations("toast")
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleReject() {
    setLoading(true)
    try {
      const result = await rejectTaskProof(taskId, reason.trim() || undefined)
      if (result?.error) {
        toast.error(translateActionError(result.error))
        setLoading(false)
        return
      }
      toast.success(tToast("taskReturned"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("returnToPartner")}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("returnReasonPlaceholder")}
        maxLength={500}
        className="h-7 w-52 text-xs"
      />
      <Button size="sm" variant="destructive" disabled={loading} onClick={handleReject}>
        {loading ? "…" : t("returnConfirm")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  )
}

function TaskServiceManager({
  taskId,
  isTerminal,
  services,
  allServices,
}: {
  taskId: string
  isTerminal: boolean
  services: ServiceItem[]
  allServices: ActiveService[]
}) {
  const router = useRouter()
  const [removing, setRemoving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const assignedIds = new Set(services.map((s) => s.serviceId))
  const available = allServices.filter((s) => !assignedIds.has(s.id))

  async function handleRemove(taskServiceId: string) {
    setRemoving(taskServiceId)
    await removeServiceFromTask(taskServiceId)
    setRemoving(null)
    router.refresh()
  }

  async function handleAdd(serviceId: string) {
    setAdding(true)
    await addServiceToTask(taskId, serviceId)
    setAdding(false)
    router.refresh()
  }

  if (services.length === 0 && (isTerminal || available.length === 0)) return null

  return (
    <div className="pt-2 border-t space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Services</p>
      {services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {services.map((svc) => (
            <span
              key={svc.id}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border",
                svc.isCompleted
                  ? "bg-green-50 text-green-800 border-green-200"
                  : "bg-muted text-muted-foreground border-border",
              ].join(" ")}
            >
              {svc.nameEn ?? ""}
              {!isTerminal && (
                <button
                  onClick={() => handleRemove(svc.id)}
                  disabled={removing === svc.id}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!isTerminal && available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            defaultValue=""
            disabled={adding}
            className="h-6 text-xs py-0 w-44"
            onChange={(e) => {
              const val = e.target.value
              if (val) { e.target.value = ""; handleAdd(val) }
            }}
          >
            <option value="">+ Add service</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>{s.nameEn}</option>
            ))}
          </Select>
          {adding && <span className="text-xs text-muted-foreground">Adding…</span>}
        </div>
      )}
    </div>
  )
}

export function TasksSection({
  requestId,
  requestNumber,
  tasks,
  partners,
  contacts,
  taskServicesMap,
  allServices,
}: {
  requestId: string
  requestNumber: string
  tasks: TaskRow[]
  partners: PartnerData[]
  contacts: ContactOption[]
  taskServicesMap: Record<string, ServiceItem[]>
  allServices: ActiveService[]
}) {
  const t = useTranslations("tasks")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
        contactId: (fd.get("contactId") as string) || undefined,
        executionMode: ((fd.get("executionMode") as string) || "manual") as "manual" | "api_courier",
        photoRequired: fd.get("photoRequired") === "on",
        notes: (fd.get("notes") as string) || undefined,
      })
      if (result.error) { setError(translateActionError(result.error)); toast.error(translateActionError(result.error)); setLoading(false); return }
      toast.success(tToast("taskAssigned"))
      setShowForm(false)
      setSelectedPartnerId("")
      router.refresh()
    } catch {
      setError("Unexpected error"); toast.error(tToast("genericError")); setLoading(false)
    }
  }

  async function handleCancel(taskId: string) {
    try {
      const result = await cancelTask(taskId)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("taskCancelled"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  async function handleDelete(taskId: string) {
    try {
      const result = await deleteTask(taskId)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("deleted"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
  }

  async function handleRegenerate(taskId: string) {
    try {
      const result = await regenerateTaskLink(taskId)
      if (result.error) { toast.error(translateActionError(result.error)); return }
      toast.success(tToast("linkRegenerated"))
      router.refresh()
    } catch {
      toast.error(tToast("genericError"))
    }
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
            const isTerminal = ["closed", "rejected", "failed", "cancelled"].includes(task.status)
            const taskServices = taskServicesMap[task.id] ?? []
            return (
              <div key={task.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{task.partnerName ?? "—"}</p>
                    {task.contactName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        → {task.contactName}{task.contactCity ? ` · ${task.contactCity}` : ""}
                      </p>
                    )}
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

                {/* Services checklist manager */}
                <TaskServiceManager
                  taskId={task.id}
                  isTerminal={isTerminal}
                  services={taskServices}
                  allServices={allServices}
                />

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {/* Copy link for active tasks */}
                  {isActive && !isExpired && (
                    <CopyTaskLink token={task.taskToken} />
                  )}

                  {/* WhatsApp the task link to the partner */}
                  {isActive && !isExpired && task.executionMode === "manual" && (() => {
                    const url = buildWhatsappUrl(
                      task.partnerMobile,
                      partnerAssignmentMessage({
                        partnerName: task.partnerName ?? "",
                        requestNumber,
                        taskLink: taskLink(task.taskToken),
                      })
                    )
                    if (!url) return null
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        <MessageCircle className="size-3" />
                        {t("whatsappPartner")}
                      </a>
                    )
                  })()}

                  {task.executionMode === "api_courier" && isActive && (
                    <span className="text-xs text-muted-foreground italic">{t("apiCourierSoon")}</span>
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

                  {/* Sign off (or admin override for a failed task) */}
                  {(task.status === "pending_signoff" || task.status === "failed") && (
                    <SignOffButton
                      taskId={task.id}
                      pricingModel={task.pricingModel}
                      unitPrice={task.unitPrice}
                      isOverride={task.status === "failed"}
                    />
                  )}

                  {/* Reject proof — send the task back to the partner */}
                  {task.status === "pending_signoff" && (
                    <RejectProofButton taskId={task.id} />
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

                  {/* Delete */}
                  {confirmDeleteId === task.id ? (
                    <span className="inline-flex items-center gap-1.5 text-xs ml-auto">
                      <span className="text-muted-foreground">Delete?</span>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="text-destructive hover:underline font-medium"
                      >Yes</button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >No</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(task.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  )}

                  <span className="text-xs text-muted-foreground">
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

            {contacts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Deliver to <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
                <Select name="contactId" defaultValue="">
                  <option value="">— No specific contact —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.city ? ` · ${c.city}` : ""}{c.role ? ` (${c.role})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{t("executionMode")}</Label>
              <Select name="executionMode" defaultValue="manual">
                <option value="manual">{t("manual")}</option>
                <option value="api_courier">{t("apiCourier")}</option>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" name="photoRequired" defaultChecked className="size-3.5 accent-primary" />
              {t("photoRequiredToggle")}
            </label>

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
