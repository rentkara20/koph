export type QcSummary = {
  total: number
  pending: number
  passed: number
  failed: number
  returnedToSupplier: number
}

const PASSED_STATUSES = new Set(["in_stock", "reserved", "assigned", "delivered", "sold"])

export function isQcFailedStatus(status: string): boolean {
  return status !== "receiving_qc" && status !== "supplier_returned" && !PASSED_STATUSES.has(status)
}

export function isQcClear(summary: QcSummary): boolean {
  return summary.pending === 0 && summary.failed === 0
}

export function summarizeQcAssets(assets: ReadonlyArray<{ status: string }>): QcSummary {
  return assets.reduce<QcSummary>(
    (summary, asset) => {
      summary.total += 1
      if (asset.status === "receiving_qc") summary.pending += 1
      else if (asset.status === "supplier_returned") summary.returnedToSupplier += 1
      else if (PASSED_STATUSES.has(asset.status)) summary.passed += 1
      else if (isQcFailedStatus(asset.status)) summary.failed += 1
      return summary
    },
    { total: 0, pending: 0, passed: 0, failed: 0, returnedToSupplier: 0 }
  )
}
