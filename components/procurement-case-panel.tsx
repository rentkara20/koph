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
import type { ProcurementCaseLineItem } from "@/lib/actions/procurement-case"
import { procurementCaseStatusVariant as CASE_STATUS_VARIANT } from "@/lib/domain/status-variant"

export function ProcurementCasePanel({
  procurementCase,
  linkedPurchaseOrders,
  sourceRequests,
  lineItems,
}: {
  procurementCase: ProcurementCase
  linkedPurchaseOrders?: { id: string; poNumber: string; status: string }[]
  sourceRequests?: { id: string; externalRef: string | null; title: string | null }[]
  lineItems?: ProcurementCaseLineItem[]
}) {
  const t = useTranslations("procurementCase")
  const router = useRouter()
  const [erpSystem, setErpSystem] = useState<"zoho" | "odoo">("zoho")
  const [externalPoRef, setExternalPoRef] = useState("")
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
      const poResult = await createPurchaseOrderFromCase({
        procurementCaseId: procurementCase.id,
      })
      if (poResult.error) {
        const msg = translateActionError(poResult.error)
        setError(msg)
        toast.error(msg)
        router.refresh()
        return
      }
      toast.success(t("poCreated"))
      router.push(`/admin/procurement/${poResult.id}`)
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

      {sourceRequests && sourceRequests.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          <p className="mb-1 font-medium text-muted-foreground">
            {t("coversRequests", { count: sourceRequests.length })}
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {sourceRequests.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/sourcing/${r.id}`} className="text-kara-purple hover:underline">
                  {r.externalRef ?? r.title ?? r.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isSuperseded && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium">{t("lineItemsTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("lineItemsHint")}</p>
          {sourceRequests && sourceRequests.length > 0 && (
            <p className="text-sm">
              {t("referenceNumber")}:{" "}
              <span className="font-mono font-medium" dir="ltr">
                {sourceRequests.map((r) => r.externalRef ?? r.title ?? r.id).join(", ")}
              </span>
            </p>
          )}
          {!lineItems || lineItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noLineItems")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-start text-xs text-muted-foreground">
                    <th className="p-1 text-start">{t("item")}</th>
                    <th className="p-1 text-start">{t("partNumber")}</th>
                    <th className="p-1 text-start">{t("supplier")}</th>
                    <th className="p-1 text-start">{t("quantity")}</th>
                    <th className="p-1 text-start">{t("unitPrice")}</th>
                    <th className="p-1 text-start">{t("tax")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-1">{item.itemDescription}</td>
                      <td className="p-1 font-mono" dir="ltr">
                        {item.partNumber ?? "—"}
                      </td>
                      <td className="p-1">{item.supplierName ?? "—"}</td>
                      <td className="p-1" dir="ltr">
                        {item.quantity}
                      </td>
                      <td className="p-1" dir="ltr">
                        {item.unitPrice != null ? `${item.unitPrice} ${item.currency}` : "—"}
                      </td>
                      <td className="p-1" dir="ltr">
                        {item.taxRate != null ? `${item.taxRate}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
            {t("saveAndContinue")}
          </Button>
        </div>
      ) : null}

      {isLinked && procurementCase.source === "commercial_flow" && !hasLinkedPo && !isSuperseded && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-medium">{t("nextStep")}</p>
            <p className="text-xs text-muted-foreground">{t("createPoAutomaticallyHint")}</p>
          </div>
          <Button size="sm" onClick={handleCreatePo} disabled={pending}>
            {pending && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("continueToPurchaseOrder")}
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
