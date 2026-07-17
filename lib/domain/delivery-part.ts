export function resolveNextDeliveryPartNumber({
  requestTypeSlug,
  orderReference,
  highestExistingPart,
}: {
  requestTypeSlug: string | null | undefined
  orderReference: string | null | undefined
  highestExistingPart: number | null | undefined
}): number | null {
  if (requestTypeSlug !== "delivery" || !orderReference?.trim()) return null
  return Math.max(0, highestExistingPart ?? 0) + 1
}
