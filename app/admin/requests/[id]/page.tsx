import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getRequest } from "@/lib/actions/requests"
import { getTasksForRequest, getPartnersWithContracts } from "@/lib/actions/tasks"
import { getSignatureRequestsForRequest } from "@/lib/actions/signatures"
import { getTaskServicesForRequest } from "@/lib/actions/task-services"
import { getActiveServices } from "@/lib/actions/services"
import { buttonVariants } from "@/components/ui/button"
import { Badge, requestStatusVariant } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatDate, formatDateTime } from "@/lib/utils/format"
import { RequestStatusActions } from "./_components/request-status-actions"
import { CopyButton } from "./_components/copy-button"
import { TasksSection } from "./_components/tasks-section"
import { SignaturesSection } from "./_components/signatures-section"
import { cn } from "@/lib/utils"

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [data, tasks, partnersWithContracts, signatures, taskServicesMap, allServices, t, tCommon] = await Promise.all([
    getRequest(id),
    getTasksForRequest(id),
    getPartnersWithContracts(),
    getSignatureRequestsForRequest(id),
    getTaskServicesForRequest(id),
    getActiveServices(),
    getTranslations("requests"),
    getTranslations("common"),
  ])

  if (!data) notFound()

  const { request, items, customer, requestType, logs } = data

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/requests"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">
                {request.requestNumber}
              </h1>
              <Badge variant={requestStatusVariant[request.status] ?? "outline"}>
                {t(`status.${request.status}`)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created {formatDate(request.createdAt)}
            </p>
          </div>
        </div>
        <RequestStatusActions requestId={request.id} currentStatus={request.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t("quoteNumber")}</dt>
                <dd className="font-mono font-semibold mt-0.5 text-base">
                  {request.quoteNumber ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("type")}</dt>
                <dd className="font-medium mt-0.5">{requestType?.nameEn ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("customer")}</dt>
                <dd className="font-medium mt-0.5">
                  {customer ? (
                    <Link
                      href={`/admin/customers/${customer.id}`}
                      className="hover:text-primary transition-colors"
                    >
                      {customer.name}
                    </Link>
                  ) : "—"}
                </dd>
              </div>
              {customer?.mobile && (
                <div>
                  <dt className="text-muted-foreground">Mobile</dt>
                  <dd className="font-medium mt-0.5">{customer.mobile}</dd>
                </div>
              )}
              {customer?.city && (
                <div>
                  <dt className="text-muted-foreground">City</dt>
                  <dd className="font-medium mt-0.5">{customer.city}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">{t("deliveryDate")}</dt>
                <dd className="font-medium mt-0.5">{formatDate(request.deliveryDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("collectionDate")}</dt>
                <dd className="font-medium mt-0.5">{formatDate(request.collectionDate)}</dd>
              </div>
              {request.timeWindow && (
                <div>
                  <dt className="text-muted-foreground">{t("timeWindow")}</dt>
                  <dd className="font-medium mt-0.5">{request.timeWindow}</dd>
                </div>
              )}
              {request.salesRef && (
                <div>
                  <dt className="text-muted-foreground">{t("salesRef")}</dt>
                  <dd className="font-medium mt-0.5">{request.salesRef}</dd>
                </div>
              )}
              {request.poNumber && (
                <div>
                  <dt className="text-muted-foreground">{t("poNumber")}</dt>
                  <dd className="font-medium mt-0.5">{request.poNumber}</dd>
                </div>
              )}
              {request.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{tCommon("notes")}</dt>
                  <dd className="font-medium mt-0.5">{request.notes}</dd>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          {items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("items")} ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                        Description
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">
                        Brand / Model
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">
                        S/N
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                        Qty
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{item.description}</p>
                          {item.accessories && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.accessories}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                          {[item.brand, item.model].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden md:table-cell">
                          {item.serialNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Partner tasks ({tasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TasksSection
                requestId={request.id}
                tasks={tasks}
                partners={partnersWithContracts}
                taskServicesMap={taskServicesMap}
                allServices={allServices}
              />
            </CardContent>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Signature requests ({signatures.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SignaturesSection
                requestId={request.id}
                signatures={signatures}
                defaultRequireNationalId={request.requireNationalId}
              />
            </CardContent>
          </Card>

          {/* Activity log */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("timeline")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">{log.action}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("trackingCode")}</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold tracking-widest text-base">
                    {request.trackingCode}
                  </span>
                  <CopyButton value={request.trackingCode} />
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("requestNumber")}</p>
                <span className="font-mono">{request.requestNumber}</span>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Require National ID</p>
                <span>{request.requireNationalId ? "Yes" : "No"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
