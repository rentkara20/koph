import { useTranslations } from "next-intl"
import type { Customer, Order, OrderLine } from "@/lib/db/schema"
import { DetailField, DetailGrid } from "@/components/detail-field"
import { formatDate } from "@/lib/utils/format"

export function OrderView({
  order,
  lines,
  customers,
}: {
  order: Order
  lines: OrderLine[]
  customers: Customer[]
}) {
  const t = useTranslations("orders")
  const tCommon = useTranslations("common")
  const customerName = customers.find((c) => c.id === order.customerId)?.name

  return (
    <div className="space-y-6">
      <DetailGrid>
        <DetailField label={t("orderNumber")} value={order.orderNumber} />
        <DetailField label={t("quoteDate")} value={order.quoteDate ? formatDate(order.quoteDate) : null} />
        <DetailField label={t("customer")} value={customerName} span />
        <DetailField label={tCommon("notes")} value={order.notes} span />
      </DetailGrid>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("lines")}</h3>
        <ul className="divide-y rounded-lg border">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{line.description}</span>
              <span className="text-muted-foreground">
                {line.quantity} {t("unitsCount")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
