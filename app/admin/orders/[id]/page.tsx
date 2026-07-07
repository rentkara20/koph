import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft, Truck } from "lucide-react"
import { getOrder, deleteOrder, getRequestsForOrder } from "@/lib/actions/orders"
import { getCustomers } from "@/lib/actions/customers"
import { getSuppliers } from "@/lib/actions/suppliers"
import { buttonVariants } from "@/components/ui/button"
import { Badge, requestStatusVariant } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { orderStatusVariant } from "@/lib/utils/order-status"
import { formatDate } from "@/lib/utils/format"
import { OrderEditForm } from "./_components/order-edit-form"
import { OrderView } from "./_components/order-view"
import { UnitsSection } from "./_components/units-section"
import { CancelOrderButton } from "./_components/cancel-order-button"
import { DeleteButton } from "@/components/delete-button"
import { EditableSection } from "@/components/editable-section"
import { cn } from "@/lib/utils"

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, tRequests, data, customerList, supplierList, linkedRequests] = await Promise.all([
    getTranslations("orders"),
    getTranslations("requests"),
    getOrder(id),
    getCustomers(),
    getSuppliers(),
    getRequestsForOrder(id),
  ])

  if (!data) notFound()
  const { order, lines, units } = data

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">{order.orderNumber}</h1>
          <Badge variant={orderStatusVariant[order.status] ?? "outline"}>
            {t(`status.${order.status}`)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/requests/new?orderNumber=${encodeURIComponent(order.orderNumber)}`}
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
          >
            <Truck className="size-3.5" />
            {t("createDeliveryRequest")}
          </Link>
          <CancelOrderButton orderId={id} isCancelled={order.status === "cancelled"} />
          <DeleteButton onDelete={deleteOrder.bind(null, id)} redirectTo="/admin/orders" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orderDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditableSection
            editLabel="Edit"
            view={<OrderView order={order} lines={lines} customers={customerList} />}
            edit={<OrderEditForm order={order} lines={lines} customers={customerList} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("units")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("unitsDescription")}</p>
        </CardHeader>
        <CardContent>
          <UnitsSection orderId={id} lines={lines} units={units} suppliers={supplierList} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("linkedRequests")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("linkedRequestsDescription")}</p>
        </CardHeader>
        <CardContent>
          {linkedRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noLinkedRequests")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {linkedRequests.map((r) => (
                <li key={r.id} className="relative flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/requests/${r.id}`} className="font-medium font-mono after:absolute after:inset-0">
                      {r.requestNumber}
                    </Link>
                    <span className="text-sm text-muted-foreground">{r.typeName ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.itemCount} {t("unitsCount")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground hidden sm:inline">{formatDate(r.createdAt)}</span>
                    <Badge variant={requestStatusVariant[r.status] ?? "outline"}>
                      {tRequests(`status.${r.status}`)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
