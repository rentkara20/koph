export function resolveTaskContactId(
  explicitContactId: string | undefined,
  requestContactId: string | null
) {
  return explicitContactId?.trim() || requestContactId || null
}
