export function resolveAdminReturnPath(
  candidate: string | undefined,
  fallback: string
) {
  if (!candidate?.startsWith("/admin/") || candidate.startsWith("//")) return fallback
  return candidate
}
