"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, PackagePlus } from "lucide-react"
import { adoptUnitsIntoOrderLine } from "@/lib/actions/order-unit-adoption"
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

export type AdoptTargetLine = {
  id: string
  description: string
  remaining: number
}

// Adopting warehouse stock into this order. Devices that came back from a
// customer stay attached to the order they were first sold on, so without this
// they are free in the warehouse yet invisible to every other order — the gap
// that previously needed a one-off repoint script.
// Two names describe the same model when every meaningful word of one appears in
// the other — the same rule the allocation matcher uses, so the UI and the data
// agree on what "the exact model" means. Kept local to the component because it
// only affects presentation order, never what is allowed.
function isSameModel(a: string, b: string): boolean {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .split(/[^a-z0-9.]+/)
        .filter((token) => token.length > 0 && !["inch", "gen", "with", "and"].includes(token)),
    )
  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return false
  const [inner, outer] = left.size <= right.size ? [left, right] : [right, left]
  for (const token of inner) if (!outer.has(token)) return false
  return true
}

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
  const [lineId, setLineId] = useState(lines[0]?.id ?? "")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const line = lines.find((l) => l.id === lineId)
  // Substitution is normal business: the customer orders a spec and may be given
  // an equivalent or better device at delivery. So nothing is hidden — every
  // free device stays selectable. The name match only decides ORDER: the exact
  // model first, alternatives below under their own heading, so choosing a
  // substitute is a deliberate act rather than an accident.
  const { matching, others } = useMemo(() => {
    const exact: AdoptableUnit[] = []
    const rest: AdoptableUnit[] = []
    for (const unit of units) {
      if (line && isSameModel(unit.description, line.description)) exact.push(unit)
      else rest.push(unit)
    }
    return { matching: exact, others: rest }
  }, [units, line])

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
    router.refresh()
  }

  if (lines.length === 0) return null

  const overCapacity = line ? selected.size > line.remaining : false

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
          }}
        >
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.description} — {t("adoptStockRemaining", { count: l.remaining })}
            </option>
          ))}
        </Select>
      </div>

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

      {overCapacity && (
        <p className="text-sm text-destructive" role="alert">
          {t("adoptStockOverCapacity", { remaining: line?.remaining ?? 0 })}
        </p>
      )}

      <Button onClick={submit} disabled={loading || selected.size === 0 || overCapacity}>
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackagePlus className="size-4" aria-hidden />}
        {selected.size > 0
          ? t("adoptStockSubmitCount", { count: selected.size })
          : tCommon("save")}
      </Button>
    </div>
  )
}
