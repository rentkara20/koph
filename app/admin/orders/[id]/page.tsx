import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getRequestWorkspace } from "@/lib/actions/request-workspace"
import { getOrder, deleteOrder } from "@/lib/actions/orders"
import { getCustomers } from "@/lib/actions/customers"
import { getSuppliers } from "@/lib/actions/suppliers"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EditableSection } from "@/components/editable-section"
import { DeleteButton } from "@/components/delete-button"
import { WorkspaceHeader } from "@/components/request-workspace/workspace-header"
import { WorkspaceTabBar, resolveTab } from "@/components/request-workspace/workspace-tabs"
import { OverviewTab } from "@/components/request-workspace/tabs/overview-tab"
import { BuyingTab } from "@/components/request-workspace/tabs/buying-tab"
import { DevicesTab } from "@/components/request-workspace/tabs/devices-tab"
import { JobsTab } from "@/components/request-workspace/tabs/jobs-tab"
import { DocumentsTab } from "@/components/request-workspace/tabs/documents-tab"
import { MoneyTab } from "@/components/request-workspace/tabs/money-tab"
import { TimelineTab } from "@/components/request-workspace/tabs/timeline-tab"
import { OrderView } from "./_components/order-view"
import { OrderEditForm } from "./_components/order-edit-form"
import { UnitsSection } from "./_components/units-section"
import { CancelOrderButton } from "./_components/cancel-order-button"

// Request Mission Control (spec §1): sticky header with the 9-stage journey +
// next actions, one tab of the request family visible at a time. The read
// model comes from a single aggregate action; management (edit / units /
// cancel / delete) stays available inside the relevant tabs via the
// pre-existing components.
export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams])
  const tab = resolveTab(rawTab)

  const [tOrders, workspace] = await Promise.all([
    getTranslations("orders"),
    getRequestWorkspace(id),
  ])
  if (!workspace) notFound()

  // Editable sections still need the legacy shapes (full lines/units rows +
  // pickers); fetched only for the tabs that render them.
  const needsLegacyData = tab === "overview" || tab === "devices"
  const [data, customerList, supplierList] = await Promise.all([
    needsLegacyData ? getOrder(id) : null,
    tab === "overview" ? getCustomers() : [],
    tab === "devices" ? getSuppliers() : [],
  ])
  if (needsLegacyData && !data) notFound()

  return (
    <div className="space-y-4">
      <WorkspaceHeader workspace={workspace} />

      <WorkspaceTabBar
        orderId={id}
        active={tab}
        counts={{
          buying: workspace.sourcing.length + workspace.purchaseOrders.length,
          devices: workspace.units.length,
          jobs: workspace.jobs.length,
          documents: workspace.signatures.length + workspace.attachments.length,
          money: workspace.payments.length,
        }}
      />

      {tab === "overview" && data && (
        <div className="space-y-4">
          <OverviewTab workspace={workspace} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tOrders("orderDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableSection
                editLabel="Edit"
                view={<OrderView order={data.order} lines={data.lines} customers={customerList} />}
                edit={<OrderEditForm order={data.order} lines={data.lines} customers={customerList} />}
              />
            </CardContent>
          </Card>
          <div className="flex items-center justify-end gap-2">
            <CancelOrderButton orderId={id} isCancelled={workspace.order.status === "cancelled"} />
            <DeleteButton onDelete={deleteOrder.bind(null, id)} redirectTo="/admin/orders" />
          </div>
        </div>
      )}

      {tab === "buying" && <BuyingTab workspace={workspace} />}

      {tab === "devices" && data && (
        <div className="space-y-4">
          <DevicesTab workspace={workspace} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tOrders("units")}</CardTitle>
              <p className="text-sm text-muted-foreground">{tOrders("unitsDescription")}</p>
            </CardHeader>
            <CardContent>
              <UnitsSection orderId={id} lines={data.lines} units={data.units} suppliers={supplierList} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "jobs" && <JobsTab workspace={workspace} />}
      {tab === "documents" && <DocumentsTab workspace={workspace} />}
      {tab === "money" && <MoneyTab workspace={workspace} />}
      {tab === "timeline" && <TimelineTab workspace={workspace} />}
    </div>
  )
}
