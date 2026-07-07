import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getCustomers } from "@/lib/actions/customers"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OrderForm } from "./_components/order-form"
import { cn } from "@/lib/utils"

export default async function NewOrderPage() {
  const [t, customerList] = await Promise.all([getTranslations("orders"), getCustomers()])

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/orders"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderForm customers={customerList} />
        </CardContent>
      </Card>
    </div>
  )
}
