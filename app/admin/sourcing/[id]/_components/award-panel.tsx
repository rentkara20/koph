"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { awardSourcingItems } from "@/lib/actions/commercial-approval"
import { translateActionError } from "@/lib/i18n/action-errors"
import type { ComparisonRow } from "@/lib/actions/quotations"

const REASONS = ["lowest_price", "fastest_delivery", "recommended", "manual"] as const
type Reason = (typeof REASONS)[number]

type Pick = { quotationLineId: string; reason: Reason }

// Comparison matrix + per-item award. The operator reviews each item's
// candidate quotes (with advisory cheapest/fastest badges) and picks one per
// item with a mandatory reason. Awards feed commercial_evaluation_line — the
// single source of truth — via awardSourcingItems.
export function AwardPanel({
  matrix,
}: {
  matrix: ComparisonRow[]
}) {
  const t = useTranslations("sourcing")
  const router = useRouter()
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function setPick(itemId: string, quotationLineId: string) {
    setPicks((prev) => ({
      ...prev,
      [itemId]: { quotationLineId, reason: prev[itemId]?.reason ?? "recommended" },
    }))
  }
  function setReason(itemId: string, reason: Reason) {
    setPicks((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], reason } } : prev))
  }

  const awards = Object.entries(picks).map(([sourcingRequestItemId, p]) => ({
    sourcingRequestItemId,
    quotationLineId: p.quotationLineId,
    reason: p.reason,
  }))

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = await awardSourcingItems({ awards })
      if (result.error) {
        const msg = translateActionError(result.error)
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success(t("awardsSaved"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{t("comparisonAndAward")}</p>

      {matrix.map((row) => (
        <div key={row.item.id} className="space-y-2 rounded-lg border p-2.5">
          <p className="text-xs font-medium">
            {row.item.quantity}× {row.item.supplierDescription}
            {row.item.partNumber && (
              <span className="text-muted-foreground" dir="ltr">
                {" "}
                · {row.item.partNumber}
              </span>
            )}
          </p>

          {row.candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noQuotesForItem")}</p>
          ) : (
            <div className="space-y-1.5">
              {row.candidates.map((c) => {
                const selected = picks[row.item.id]?.quotationLineId === c.quotationLineId
                return (
                  <label
                    key={c.quotationLineId}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs ${
                      selected ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`award-${row.item.id}`}
                      className="mt-0.5"
                      checked={selected}
                      onChange={() => setPick(row.item.id, c.quotationLineId)}
                    />
                    <span className="flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{c.supplierName}</span>
                        {c.isCheapest && (
                          <Badge variant="success" className="text-[10px]">
                            {t("cheapest")}
                          </Badge>
                        )}
                        {c.isFastest && (
                          <Badge variant="default" className="text-[10px]">
                            {t("fastest")}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground" dir="ltr">
                        {c.unitPrice != null
                          ? `${c.unitPrice} ${c.currency}${c.taxRate != null ? ` +${c.taxRate}%` : ""} · Σ ${
                              c.total ?? "—"
                            } ${c.currency}`
                          : "—"}
                        {c.leadTimeDays != null && ` · ${c.leadTimeDays}d`}
                        {c.warranty && ` · ${c.warranty}`}
                        {c.availability && ` · ${c.availability}`}
                      </span>
                      {(c.offeredSpec || c.offeredPartNumber) && (
                        <span className="block text-muted-foreground" dir="ltr">
                          {c.offeredSpec}
                          {c.offeredPartNumber && ` · ${c.offeredPartNumber}`}
                        </span>
                      )}
                      {(c.upgradesNote || c.upgradesCost != null) && (
                        <span className="block text-muted-foreground">
                          {t("upgrade")}: {c.upgradesNote ?? ""}
                          {c.upgradesCost != null && ` (+${c.upgradesCost})`}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}

              {picks[row.item.id] && (
                <div>
                  <Select
                    className="text-xs"
                    value={picks[row.item.id].reason}
                    onChange={(e) => setReason(row.item.id, e.target.value as Reason)}
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`awardReasons.${r}` as never)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={pending || awards.length === 0} size="sm">
        {pending && <Loader2 className="me-2 size-4 animate-spin" />}
        {t("saveAwards")}
      </Button>
    </div>
  )
}
