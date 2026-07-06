import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getOrder, deleteOrder } from "@/lib/actions/orders"
import { getCustomers } from "@/lib/actions/customers"
import { getSuppliers } from "@/lib/actions/suppliers"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { orderStatusVariant } from "@/lib/utils/order-status"
import { OrderEditForm } from "./_components/order-edit-form"
import { UnitsSection } from "./_components/units-section"
import { DeleteButton } from "@/components/delete-button"
import { cn } from "@/lib/utils"

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, data, customerList, supplierList] = await Promise.all([
    getTranslations("orders"),
    getOrder(id),
    getCustomers(),
    getSuppliers(),
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
        <DeleteButton onDelete={deleteOrder.bind(null, id)} redirectTo="/admin/orders" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orderDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderEditForm order={order} lines={lines} customers={customerList} />
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
    </div>
  )
}
