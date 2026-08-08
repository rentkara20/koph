// Failure reasons are admin-managed rows (failure_reason table), not a fixed
// enum — so their display labels come from the DB, never from a hardcoded i18n
// list. A slug with no matching row (admin deleted it after a task recorded it)
// degrades to a readable form of the slug rather than leaking a raw key.

export type FailureReasonLabels = Record<string, { nameEn: string; nameAr: string }>

export function failureReasonLabel(
  labels: FailureReasonLabels,
  slug: string,
  locale: string
): string {
  const row = labels[slug]
  if (row) return locale === "ar" ? row.nameAr : row.nameEn
  return slug.replace(/_/g, " ")
}
