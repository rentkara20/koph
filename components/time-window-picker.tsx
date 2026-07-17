"use client"

import { useTranslations } from "next-intl"
import { Select } from "@/components/ui/select"
import { buildTimeWindow, parseTimeWindow } from "@/lib/domain/time-window"

const START_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`)
const END_HOURS = Array.from({ length: 24 }, (_, index) => `${String(index + 1).padStart(2, "0")}:00`)

export function TimeWindowPicker({
  value,
  onChange,
  name,
  idPrefix = "time-window",
  required = false,
}: {
  value: string
  onChange: (value: string) => void
  name?: string
  idPrefix?: string
  required?: boolean
}) {
  const t = useTranslations("requests")
  const parsed = parseTimeWindow(value)
  const start = parsed?.start ?? ""
  const end = parsed?.end ?? ""
  const startHour = start ? Number(start.slice(0, 2)) : null

  function changeStart(nextStart: string) {
    if (!nextStart) {
      onChange("")
      return
    }
    const startHour = Number(nextStart.slice(0, 2))
    const suggestedEnd = `${String(Math.min(24, startHour + 1)).padStart(2, "0")}:00`
    onChange(buildTimeWindow(nextStart, end) ?? buildTimeWindow(nextStart, suggestedEnd) ?? "")
  }

  function changeEnd(nextEnd: string) {
    onChange(buildTimeWindow(start, nextEnd) ?? "")
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {name && <input type="hidden" name={name} value={value} />}
      <label className="space-y-1.5" htmlFor={`${idPrefix}-start`}>
        <span className="text-xs font-medium">{t("windowFrom")}</span>
        <Select id={`${idPrefix}-start`} value={start} onChange={(event) => changeStart(event.target.value)} required={required}>
          <option value="">—</option>
          {START_HOURS.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
        </Select>
      </label>
      <label className="space-y-1.5" htmlFor={`${idPrefix}-end`}>
        <span className="text-xs font-medium">{t("windowTo")}</span>
        <Select id={`${idPrefix}-end`} value={end} onChange={(event) => changeEnd(event.target.value)} required={required} disabled={!start}>
          <option value="">—</option>
          {END_HOURS.map((hour) => (
            <option key={hour} value={hour} disabled={startHour != null && Number(hour.slice(0, 2)) <= startHour}>
              {hour}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}
