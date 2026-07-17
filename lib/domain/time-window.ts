const HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/
const END_HOUR_PATTERN = /^(?:[01]\d|2[0-4]):00$/

function hourValue(value: string): number | null {
  if (!END_HOUR_PATTERN.test(value)) return null
  return Number(value.slice(0, 2))
}

export function buildTimeWindow(start: string, end: string): string | null {
  if (!HOUR_PATTERN.test(start) || !END_HOUR_PATTERN.test(end)) return null
  const startHour = hourValue(start)
  const endHour = hourValue(end)
  if (startHour == null || endHour == null || endHour <= startHour) return null
  return `${start}-${end}`
}

export function parseTimeWindow(value?: string | null): { start: string; end: string } | null {
  if (!value) return null
  const [start, end, extra] = value.split("-")
  if (extra || !buildTimeWindow(start, end)) return null
  return { start, end }
}
