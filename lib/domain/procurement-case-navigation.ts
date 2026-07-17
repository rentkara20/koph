export function procurementCaseHref(caseId: string): string {
  return `/admin/procurement/cases/${encodeURIComponent(caseId)}`
}
