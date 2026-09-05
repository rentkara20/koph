"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, PackagePlus, X } from "lucide-react"
import {
  adoptUnitsIntoOrderLine,
  moveAllocatedUnit,
  releaseAllocatedUnit,
} from "@/lib/actions/order-unit-adoption"
import { isSameModel } from "@/lib/domain/model-match"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { translateActionError } from "@/lib/i18n/action-errors"

export type AdoptableUnit = {
  unitId: string
  serialNumber: string | null
  assetTag: string | null
  description: string
  supplierName: string | null
  originOrderNumber: string | null
}

export type AdoptLineOccupant = {
  unitId: string
  serialNumber: string | null
  assetTag: string | null
  description: string
  removable: boolean
}

export type AdoptTargetLine = {
  id: string
  description: string
  remaining: number
  occupants: AdoptLineOccupant[]
}

// Adopting warehouse stock into this order. Devices that came back from a
// customer stay attached to the order they were first sold on, so without this
// they are free in the warehouse yet invisible to every other order — the gap
// that previously needed a one-off repoint script.

function UnitList({
  units,
  selected,
  onToggle,
  t,
  showModel = false,
}: {
  units: AdoptableUnit[]
  selected: Set<string>
  onToggle: (unitId: string) => void
  t: ReturnType<typeof useTranslations>
  showModel?: boolean
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {units.map((u) => (
        <li key={u.unitId}>
          <label className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50">
            <input
              type="checkbox"
              checked={selected.has(u.unitId)}
              onChange={() => onToggle(u.unitId)}
              className="size-4 shrink-0 rounded border-input"
            />
            <span className="font-mono">{u.serialNumber ?? "—"}</span>
            {u.assetTag && <span className="text-xs text-muted-foreground">{u.assetTag}</span>}
            {showModel && <span className="text-xs text-foreground/80">{u.description}</span>}
            <span className="ms-auto text-xs text-muted-foreground">
              {u.originOrderNumber
                ? t("adoptStockFromOrder", { order: u.originOrderNumber })
                : t("adoptStockStandalone")}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

// What is already on the chosen line, by name. A bare "0 remaining" is what let
// two iPad Pros sit unnoticed on an iPad 10th Gen line: the number was correct
// and told the operator nothing. Every device here can be taken off or moved,
// so a wrong allocation is a click to undo rather than a production script.
function OccupantList({
  line,
  lines,
  orderId,
  t,
  onChanged,
}: {
  line: AdoptTargetLine
  lines: AdoptTargetLine[]
  orderId: string
  t: ReturnType<typeof useTranslations>
  onChanged: () => void
}) {
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null)
  const otherLines = lines.filter((l) => l.id !== line.id)

  async function run(unitId: string, action: () => Promise<{ error?: string }>) {
    setBusyUnitId(unitId)
    const result = await action()
    setBusyUnitId(null)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t("adoptStockOnLine", { count: line.occupants.length })}</p>
      <ul className="divide-y rounded-lg border">
        {line.occupants.map((o) => {
          const mismatch = !isSameModel(o.description, line.description)
          return (
            <li key={o.unitId} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono">{o.serialNumber ?? "—"}</span>
              {o.assetTag && <span className="text-xs text-muted-foreground">{o.assetTag}</span>}
              <span className={mismatch ? "text-xs font-medium text-amber-600" : "text-xs text-foreground/80"}>
                {o.description}
                {mismatch && ` — ${t("adoptStockOccupantMismatch")}`}
              </span>
              {o.removable ? (
                <span className="ms-auto flex flex-wrap items-center gap-2">
                  {otherLines.length > 0 && (
                    <span className="block w-56">
                    <Select
                      aria-label={t("adoptStockMoveTo")}
                      value=""
                      disabled={busyUnitId === o.unitId}
                      onChange={(e) => {
                        const targetLineId = e.target.value
                        if (!targetLineId) return
                        void run(o.unitId, () => moveAllocatedUnit(orderId, o.unitId, targetLineId))
                      }}
                      className="h-8 text-xs"
                    >
                      <option value="">{t("adoptStockMoveTo")}</option>
                      {otherLines.map((l) => (
                        <option key={l.id} value={l.id} disabled={l.remaining === 0}>
                          {l.description} — {t("adoptStockRemaining", { count: l.remaining })}
                        </option>
                      ))}
                    </Select>
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyUnitId === o.unitId}
                    onClick={() => {
                      if (!confirm(t("adoptStockReleaseConfirm", { serial: o.serialNumber ?? "—" }))) return
                      void run(o.unitId, () => releaseAllocatedUnit(orderId, o.unitId))
                    }}
                  >
                    {busyUnitId === o.unitId ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <X className="size-4" aria-hidden />
                    )}
                    {t("adoptStockRelease")}
                  </Button>
                </span>
              ) : (
                <span className="ms-auto text-xs text-muted-foreground">{t("adoptStockOccupantLocked")}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AdoptStockSection({
  orderId,
  lines,
  units,
}: {
  orderId: string
  lines: AdoptTargetLine[]
  units: AdoptableUnit[]
}) {
  const t = useTranslations("orders")
  const tCommon = useTranslations("common")
  const router = useRouter()
  // Deliberately empty: no line is pre-selected. The panel used to default to
  // whichever line came back first, so a device could be allocated to a line
  // the operator never looked at.
  const [lineId, setLineId] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [substituteAck, setSubstituteAck] = useState(false)
  const [loading, setLoading] = useState(false)

  const line = lines.find((l) => l.id === lineId)
  // Substitution is normal business: the customer orders a spec and may be given
  // an equivalent or better device at delivery. So nothing is hidden — every
  // free device stays selectable. The name match decides ORDER (the exact model
  // first, alternatives below under their own heading) and, when a substitute
  // is actually selected, forces a deliberate confirmation before saving.
  const { matching, others } = useMemo(() => {
    const exact: AdoptableUnit[] = []
    const rest: AdoptableUnit[] = []
    for (const unit of units) {
      if (line && isSameModel(unit.description, line.description)) exact.push(unit)
      else rest.push(unit)
    }
    return { matching: exact, others: rest }
  }, [units, line])

  const selectedSubstitutes = useMemo(
    () => others.filter((u) => selected.has(u.unitId)),
    [others, selected],
  )

  // A substitute confirmed for one line is not confirmed for the next.
  useEffect(() => {
    if (selectedSubstitutes.length === 0) setSubstituteAck(false)
  }, [selectedSubstitutes.length])

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  async function submit() {
    if (!lineId || selected.size === 0) return
    setLoading(true)
    const result = await adoptUnitsIntoOrderLine(orderId, lineId, [...selected])
    setLoading(false)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(t("adoptStockDone", { count: selected.size }))
    setSelected(new Set())
    setSubstituteAck(false)
    router.refresh()
  }

  if (lines.length === 0) return null

  const overCapacity = line ? selected.size > line.remaining : false
  const needsAck = selectedSubstitutes.length > 0 && !substituteAck

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("adoptStockDescription")}</p>

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="adopt-line">{t("adoptStockLine")}</Label>
        <Select
          id="adopt-line"
          value={lineId}
          onChange={(e) => {
            setLineId(e.target.value)
            setSelected(new Set())
            setSubstituteAck(false)
          }}
        >
          <option value="">{t("adoptStockLinePlaceholder")}</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.description} — {t("adoptStockRemaining", { count: l.remaining })}
            </option>
          ))}
        </Select>
      </div>

      {!line ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t("adoptStockPickLineFirst")}
        </p>
      ) : (
        <div className="space-y-4">
          {line.occupants.length > 0 && (
            <OccupantList
              line={line}
              lines={lines}
              orderId={orderId}
              t={t}
              onChanged={() => router.refresh()}
            />
          )}

          {units.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t("adoptStockEmpty")}
            </p>
          ) : (
            <div className="space-y-4">
              {matching.length > 0 && (
                <UnitList units={matching} selected={selected} onToggle={toggle} t={t} />
              )}
              {others.length > 0 && (
                <details open={matching.length === 0}>
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    {t("adoptStockSubstitutes", { count: others.length })}
                  </summary>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("adoptStockSubstitutesHint")}</p>
                  <div className="mt-2">
                    <UnitList units={others} selected={selected} onToggle={toggle} t={t} showModel />
                  </div>
                </details>
              )}
            </div>
          )}

          {selectedSubstitutes.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t("adoptStockSubstituteWarning", { line: line.description })}
              </p>
              <ul className="text-xs text-amber-900/90 dark:text-amber-200/90">
                {selectedSubstitutes.map((u) => (
                  <li key={u.unitId}>
                    <span className="font-mono">{u.serialNumber ?? "—"}</span> — {u.description}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
                <input
                  type="checkbox"
                  checked={substituteAck}
                  onChange={(e) => setSubstituteAck(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                {t("adoptStockSubstituteConfirm")}
              </label>
            </div>
          )}

          {overCapacity && (
            <p className="text-sm text-destructive" role="alert">
              {t("adoptStockOverCapacity", { remaining: line.remaining })}
            </p>
          )}

          <Button onClick={submit} disabled={loading || selected.size === 0 || overCapacity || needsAck}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackagePlus className="size-4" aria-hidden />}
            {selected.size > 0
              ? t("adoptStockSubmitCount", { count: selected.size })
              : tCommon("save")}
          </Button>
        </div>
      )}
    </div>
  )
}
