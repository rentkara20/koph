export type RequestRoutePoint = {
  label: string
  address?: string | null
  mapsLink?: string | null
  mobile?: string | null
  contactName?: string | null
  workingHours?: string | null
  accessNotes?: string | null
}

export type RequestRoutePlan = {
  kind: "outbound" | "inbound" | "swap"
  from: RequestRoutePoint
  to: RequestRoutePoint
  returnTo: RequestRoutePoint | null
  isAutomatic: boolean
}

export function buildRequestRoutePlan({
  typeSlug,
  warehouse,
  contact,
  originOverride,
  destinationOverride,
}: {
  typeSlug?: string | null
  warehouse: RequestRoutePoint
  contact: RequestRoutePoint
  originOverride?: string | null
  destinationOverride?: string | null
}): RequestRoutePlan {
  const kind = typeSlug === "swap"
    ? "swap"
    : ["collection", "maintenance"].includes(typeSlug ?? "")
      ? "inbound"
      : "outbound"

  const automaticFrom = kind === "inbound" ? contact : warehouse
  const automaticTo = kind === "inbound" ? warehouse : contact
  const from = originOverride?.trim() ? { label: originOverride.trim() } : automaticFrom
  const to = destinationOverride?.trim() ? { label: destinationOverride.trim() } : automaticTo

  return {
    kind,
    from,
    to,
    returnTo: kind === "swap" ? from : null,
    isAutomatic: !originOverride?.trim() && !destinationOverride?.trim(),
  }
}
