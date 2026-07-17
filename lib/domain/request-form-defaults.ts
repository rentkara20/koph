export function resolveRequestTypeSlug({
  initialOrderNumber,
  initialTypeSlug,
}: {
  initialOrderNumber?: string
  initialTypeSlug?: string
}) {
  const explicitType = initialTypeSlug?.trim()
  if (explicitType) return explicitType

  return initialOrderNumber?.trim() ? "delivery" : undefined
}
