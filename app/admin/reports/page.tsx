import {
  getRequestsByStatus,
  getPartnerPerformance,
  getPaymentSummaryByMonth,
  getPendingPaymentsSummary,
  getInventoryByModel,
  getSourcingRequestsByStatus,
  getProcurementCasesByStatus,
  getWarrantyAssignmentsByStatus,
  getAccessoryStockSummary,
} from "@/lib/actions/reports"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { adminRequestStatusVariant as REQUEST_STATUS_VARIANT, paymentBatchStatusVariant as BATCH_STATUS_VARIANT } from "@/lib/domain/status-variant"

export default async function ReportsPage() {
  const [
    statusRows,
    partnerPerf,
    paymentSummary,
    pendingSummary,
    inventoryByModel,
    sourcingByStatus,
    casesByStatus,
    warrantyByStatus,
    accessoryStockRows,
  ] = await Promise.all([
    getRequestsByStatus(),
    getPartnerPerformance(),
    getPaymentSummaryByMonth(),
    getPendingPaymentsSummary(),
    getInventoryByModel(),
    getSourcingRequestsByStatus(),
    getProcurementCasesByStatus(),
    getWarrantyAssignmentsByStatus(),
    getAccessoryStockSummary(),
  ])

  const totalSourcing = sourcingByStatus.reduce((s, r) => s + r.count, 0)
  const totalWarranty = warrantyByStatus.reduce((s, r) => s + r.count, 0)

  const accessoryMap = new Map<string, number>()
  for (const row of accessoryStockRows) {
    accessoryMap.set(row.nameEn, (accessoryMap.get(row.nameEn) ?? 0) + row.qty)
  }
  const accessoryRows = [...accessoryMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)

  const totalRequests = statusRows.reduce((s, r) => s + r.count, 0)

  // Collapse per-status rows into one line per model: available vs out vs other.
  const modelMap = new Map<string, { label: string; available: number; out: number; other: number }>()
  for (const row of inventoryByModel) {
    const label = [row.brand, row.model].filter(Boolean).join(" · ") || "—"
    const entry = modelMap.get(label) ?? { label, available: 0, out: 0, other: 0 }
    if (row.status === "in_stock") entry.available += row.count
    else if (["assigned", "delivered"].includes(row.status)) entry.out += row.count
    else entry.other += row.count
    modelMap.set(label, entry)
  }
  const modelRows = [...modelMap.values()].sort(
    (a, b) => b.available + b.out + b.other - (a.available + a.out + a.other)
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Operations overview</p>
      </div>

      {/* Pending payments summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total requests</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{totalRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pending payments</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{pendingSummary.pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pending amount (SAR)</p>
            <p className="text-2xl font-bold tabular-nums mt-1">
              {Number(pendingSummary.pendingTotal).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Requests by status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Requests by status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <div className="space-y-2">
              {statusRows.map((row) => {
                const pct = totalRequests > 0 ? (row.count / totalRequests) * 100 : 0
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <Badge variant={REQUEST_STATUS_VARIANT[row.status] ?? "outline"}>
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/20"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm tabular-nums font-medium w-8 text-right">
                      {row.count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sourcing requests by status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Sourcing requests by status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourcingByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sourcing requests yet.</p>
          ) : (
            <div className="space-y-2">
              {sourcingByStatus.map((row) => {
                const pct = totalSourcing > 0 ? (row.count / totalSourcing) * 100 : 0
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className="w-32 shrink-0">
                      <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/20" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm tabular-nums font-medium w-8 text-right">{row.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Procurement cases by status / source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Procurement cases by status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {casesByStatus.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No procurement cases yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {casesByStatus.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.source.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Warranty assignments by status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Warranty assignments by status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {warrantyByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warranty assignments yet.</p>
          ) : (
            <div className="space-y-2">
              {warrantyByStatus.map((row) => {
                const pct = totalWarranty > 0 ? (row.count / totalWarranty) * 100 : 0
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <div className="w-40 shrink-0">
                      <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/20" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm tabular-nums font-medium w-8 text-right">{row.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accessory stock summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Accessory stock (all locations)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {accessoryRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No accessory stock yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Qty on hand</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accessoryRows.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 tabular-nums">{row.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Partner performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Partner performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {partnerPerf.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No partner tasks yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Partner</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-green-700">Closed</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-red-700">Failed</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partnerPerf.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 tabular-nums">{p.total}</td>
                    <td className="px-4 py-3 tabular-nums text-green-700">{p.closed}</td>
                    <td className="px-4 py-3 tabular-nums text-red-700">{p.failed}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.active}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Inventory by model */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Inventory by model
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {modelRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No devices yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Model</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-green-700">Available</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Out</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Other</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelRows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums text-green-700">{row.available}</td>
                    <td className="px-4 py-3 tabular-nums">{row.out}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{row.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Payment summary by month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Payment summary by period
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {paymentSummary.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No payment batches yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Period</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Batches</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Total (SAR)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paymentSummary.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 font-mono">{row.period}</td>
                    <td className="px-4 py-3">
                      <Badge variant={BATCH_STATUS_VARIANT[row.status] ?? "outline"}>
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.batchCount}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {Number(row.totalAmount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
