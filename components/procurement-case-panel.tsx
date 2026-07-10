"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { linkExternalPo, supersedeProcurementCase } from "@/lib/actions/procurement-case"
import { createPurchaseOrderFromCase } from "@/lib/actions/procurement"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { ProcurementCase } from "@/lib/db/schema"

const CASE_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  open: "default",
  handed_off: "default",
  po_linked: "success",
  closed: "secondary",
  cancelled: "destructive",
  superseded: "destructive",
}

export function ProcurementCasePanel({
  procurementCase,
  linkedPurchaseOrders,
}: {
  procurementCase: ProcurementCase
  linkedPurchaseOrders?: { id: string; poNumber: string; status: string }[]
}) {
  const t = useTranslations("procurementCase")
  const router = useRouter()
  const [erpSystem, setErpSystem] = useState<"zoho" | "odoo">("zoho")
  const [externalPoRef, setExternalPoRef] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const isLinked = Boolean(procurementCase.externalPoRef)
  const isSuperseded = procurementCase.status === "superseded"
  const hasLinkedPo = Boolean(linkedPurchaseOrders && linkedPurchaseOrders.length > 0)

  function handleCreatePo() {
    setError("")
    startTransition(async () => {
      const result = await createPurchaseOrderFromCase({
        procurementCaseId: procurementCase.id,
        poNumber: poNumber.trim(),
      })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("poCreated"))
      router.push(`/admin/procurement/${result.id}`)
    })
  }

  function handleLink() {
    setError("")
    startTransition(async () => {
      const result = await linkExternalPo({
        procurementCaseId: procurementCase.id,
        erpSystem,
        externalPoRef: externalPoRef.trim(),
      })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("linked"))
      router.refresh()
    })
  }

  function handleSupersede() {
    setError("")
    startTransition(async () => {
      const result = await supersedeProcurementCase({ caseId: procurementCase.id, reason: reason.trim() })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("superseded"))
      setReason("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("title")}</p>
        <Badge variant={CASE_STATUS_VARIANT[procurementCase.status] ?? "secondary"}>
          {t(`statuses.${procurementCase.status}` as never)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t(`sources.${procurementCase.source}` as never)}</p>

      {isLinked ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p>
            {t("erpSystem")}: <span className="font-medium">{procurementCase.erpSystem}</span>
          </p>
          <p dir="ltr">
            {t("externalPoRef")}: <span className="font-mono font-medium">{procurementCase.externalPoRef}</span>
          </p>
        </div>
      ) : !isSuperseded ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium">{t("linkExternalPo")}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">{t("erpSystem")}</Label>
              <Select value={erpSystem} onChange={(e) => setErpSystem(e.target.value as "zoho" | "odoo")}>
                <option value="zoho">Zoho</option>
                <option value="odoo">Odoo</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">{t("externalPoRef")}</Label>
              <Input value={externalPoRef} onChange={(e) => setExternalPoRef(e.target.value)} dir="ltr" />
            </div>
          </div>
          <Button size="sm" onClick={handleLink} disabled={pending || !externalPoRef.trim()}>
            {pending && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("linkExternalPo")}
          </Button>
        </div>
      ) : null}

      {isLinked && procurementCase.source === "commercial_flow" && !hasLinkedPo && !isSuperseded && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium">{t("createPo")}</p>
          <Label className="text-xs">{t("poNumber")}</Label>
          <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} dir="ltr" />
          <Button size="sm" onClick={handleCreatePo} disabled={pending || !poNumber.trim()}>
            {pending && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("createPo")}
          </Button>
        </div>
      )}

      {linkedPurchaseOrders && linkedPurchaseOrders.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("linkedPurchaseOrders")}</p>
          <ul className="space-y-1">
            {linkedPurchaseOrders.map((po) => (
              <li key={po.id}>
                <Link href={`/admin/procurement/${po.id}`} className="font-mono text-sm text-kara-purple hover:underline" dir="ltr">
                  {po.poNumber}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isSuperseded && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">{t("supersede")}</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={t("supersedeReason")} />
          <Button size="sm" variant="outline" onClick={handleSupersede} disabled={pending || !reason.trim()}>
            {pending && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("supersede")}
          </Button>
        </div>
      )}

      {procurementCase.supersededByCaseId && (
        <p className="text-xs text-muted-foreground">{t("supersededNote")}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
