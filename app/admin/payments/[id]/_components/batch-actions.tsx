"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Download } from "lucide-react"
import { approveBatch, markBatchSentToFinance, markBatchPaid } from "@/lib/actions/payments"
import { Button } from "@/components/ui/button"
import { translateActionError } from "@/lib/i18n/action-errors"

type Payment = {
  requestNumber: string | null
  pricingModel: string
  quantity: number
  unitPrice: number
  totalAmount: number
}

type Props = {
  batchId: string
  status: string
  partnerName: string
  period: string
  payments: Payment[]
}

export function BatchActions({ batchId, status, partnerName, period, payments }: Props) {
  const router = useRouter()
  const tToast = useTranslations("toast")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handle(
    action: () => Promise<{ error?: string }>,
    successKey: string
  ) {
    setError("")
    setLoading(true)
    try {
      const result = await action()
      setLoading(false)
      if (result.error) {
        setError(translateActionError(result.error))
        toast.error(translateActionError(result.error))
      } else {
        toast.success(tToast(successKey))
        router.refresh()
      }
    } catch {
      setLoading(false)
      toast.error(tToast("genericError"))
    }
  }

  function exportCsv() {
    const headers = ["Request", "Pricing model", "Qty", "Unit price (SAR)", "Total (SAR)"]
    const rows: string[][] = payments.map((p) => [
      p.requestNumber ?? "—",
      p.pricingModel.replace(/_/g, " "),
      p.quantity.toString(),
      p.unitPrice.toFixed(2),
      p.totalAmount.toFixed(2),
    ])
    const total = payments.reduce((s, p) => s + p.totalAmount, 0)
    rows.push(["", "", "", "Total", total.toFixed(2)])

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n")

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `batch-${(partnerName ?? "").replace(/\s+/g, "-")}-${period}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <Button
            size="sm"
            disabled={loading}
            onClick={() => handle(() => approveBatch(batchId), "batchApproved")}
          >
            {loading ? "…" : "Approve batch"}
          </Button>
        )}
        {status === "approved" && (
          <Button
            size="sm"
            disabled={loading}
            onClick={() => handle(() => markBatchSentToFinance(batchId), "batchSent")}
          >
            {loading ? "…" : "Mark sent to finance"}
          </Button>
        )}
        {status === "sent_to_finance" && (
          <Button
            size="sm"
            disabled={loading}
            onClick={() => handle(() => markBatchPaid(batchId), "batchPaid")}
          >
            {loading ? "…" : "Mark as paid"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
