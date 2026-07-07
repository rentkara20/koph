import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getRequestTypes } from "@/lib/actions/requests"
import { getCustomers } from "@/lib/actions/customers"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RequestForm } from "./_components/request-form"
import { cn } from "@/lib/utils"

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ orderNumber?: string }>
}) {
  const [{ orderNumber }, t, requestTypes, customerList] = await Promise.all([
    searchParams,
    getTranslations("requests"),
    getRequestTypes(),
    getCustomers(),
  ])

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/requests"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestForm requestTypes={requestTypes} customers={customerList} initialOrderNumber={orderNumber} />
        </CardContent>
      </Card>
    </div>
  )
}
