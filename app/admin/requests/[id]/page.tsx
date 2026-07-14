import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getRequest, getRequestContacts, deleteRequest } from "@/lib/actions/requests"
import { getTasksForRequest, getPartnersWithContracts } from "@/lib/actions/tasks"
import { getSignatureRequestsForRequest } from "@/lib/actions/signatures"
import { appBaseUrl } from "@/lib/utils/public-url"
import { getTaskServicesForRequest } from "@/lib/actions/task-services"
import { getActiveServices } from "@/lib/actions/services"
import { buttonVariants } from "@/components/ui/button"
import { Badge, requestStatusVariant } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatDate, formatDateTime } from "@/lib/utils/format"
import { RequestStatusActions } from "./_components/request-status-actions"
import { ReopenRequestButton } from "./_components/reopen-request-button"
import { DeleteButton } from "@/components/delete-button"
import { CopyButton } from "./_components/copy-button"
import { TasksSection } from "./_components/tasks-section"
import { SignaturesSection } from "./_components/signatures-section"
import { ItemsSection } from "./_components/items-section"
import { ReceiverSection } from "./_components/receiver-section"
import { LogisticsSection } from "./_components/logistics-section"
import { NextStepBanner } from "./_components/next-step-banner"
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

  const contacts = data ? await getRequestContacts(data.request.customerId) : []

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
            <ArrowLeft className="size-4 rtl:rotate-180" />
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
              {t("createdOn", { date: formatDate(request.createdAt) })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReopenRequestButton requestId={request.id} currentStatus={request.status} />
          <RequestStatusActions requestId={request.id} currentStatus={request.status} />
          <DeleteButton
            onDelete={deleteRequest.bind(null, request.id)}
            redirectTo="/admin/requests"
          />
        </div>
      </div>

      {/* Guided next-step prompt driven by current pipeline state */}
      <NextStepBanner
        status={request.status}
        itemCount={items.length}
        taskCount={tasks.length}
        hasPendingSignoff={tasks.some((t) => t.status === "pending_signoff")}
        hasSignedSignature={signatures.some((s) => s.status === "signed")}
        hasAnySignature={signatures.length > 0}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              {request.quoteNumber && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{t("quoteNumber")}</dt>
                  <dd className="font-mono font-semibold mt-0.5 text-base">
                    {request.quoteNumber}
                  </dd>
                </div>
              )}
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
                  <dt className="text-muted-foreground">{t("mobile")}</dt>
                  <dd className="font-medium mt-0.5">
                    <a href={`tel:${customer.mobile}`} className="hover:text-primary transition-colors">
                      {customer.mobile}
                    </a>
                  </dd>
                </div>
              )}
              {customer?.city && (
                <div>
                  <dt className="text-muted-foreground">{t("city")}</dt>
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

          {/* Receiver */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("receiver")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiverSection
                requestId={request.id}
                customerId={request.customerId}
                contacts={contacts}
                receiverContactId={request.receiverContactId ?? null}
              />
            </CardContent>
          </Card>

          {/* Logistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("logistics")}</CardTitle>
            </CardHeader>
            <CardContent>
              <LogisticsSection
                requestId={request.id}
                origin={request.origin ?? null}
                destination={request.destination ?? null}
                scheduledAt={request.scheduledAt ?? null}
              />
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("items")} ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ItemsSection requestId={request.id} initialItems={items} />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("partnerTasks")} ({tasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TasksSection
                requestId={request.id}
                requestNumber={request.requestNumber}
                tasks={tasks}
                partners={partnersWithContracts}
                contacts={contacts}
                taskServicesMap={taskServicesMap}
                allServices={allServices}
              />
            </CardContent>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("signatureRequests")} ({signatures.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SignaturesSection
                requestId={request.id}
                requestNumber={request.requestNumber}
                signatures={signatures}
                defaultRequireNationalId={request.requireNationalId}
                receiverContact={
                  contacts.find((c) => c.id === request.receiverContactId) ?? null
                }
                authorizedContact={contacts.find((c) => c.isAuthorizedSignatory) ?? null}
                defaultDocumentName={`Delivery Note #${request.quoteNumber ?? request.requestNumber}${customer ? " " + customer.name : ""}`}
                baseUrl={appBaseUrl()}
                customerName={customer?.name ?? null}
                receiverEmail={
                  contacts.find((c) => c.id === request.receiverContactId)?.email ??
                  customer?.email ??
                  null
                }
                itemsSummary={
                  items.length > 0
                    ? items.map((i) => `${i.description}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join("، ")
                    : "الأصناف المتفق عليها"
                }
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
                      <p className="text-muted-foreground capitalize">
                        {log.i18nKey
                          .replace(/^activity\./, "")
                          .replace(/([A-Z])/g, " $1")
                          .replace(/_/g, " ")
                          .trim()}
                      </p>
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
                <p className="text-xs text-muted-foreground mb-1">{t("requireNationalId")}</p>
                <span>{request.requireNationalId ? tCommon("yes") : tCommon("no")}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
