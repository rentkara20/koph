import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getPartner, deletePartner } from "@/lib/actions/partners"
import { getRequestTypes } from "@/lib/actions/requests"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PartnerEditForm } from "./_components/partner-edit-form"
import { ContractsSection } from "./_components/contracts-section"
import { PartnerLoginSection } from "./_components/partner-login-section"
import { DeleteButton } from "@/components/delete-button"
import { cn } from "@/lib/utils"

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [data, requestTypes, t] = await Promise.all([
    getPartner(id),
    getRequestTypes(),
    getTranslations("partners"),
  ])

  if (!data) notFound()

  const { partner, contracts, linkedEmail } = data

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/partners" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{partner.name}</h1>
            <Badge variant={partner.status === "active" ? "success" : "secondary"}>
              {partner.status === "active" ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
        <DeleteButton
          onDelete={deletePartner.bind(null, id)}
          redirectTo="/admin/partners"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Partner info</CardTitle></CardHeader>
            <CardContent>
              <PartnerEditForm partner={partner} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("contracts")} ({contracts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ContractsSection
                partnerId={partner.id}
                contracts={contracts}
                requestTypes={requestTypes}
              />
            </CardContent>
          </Card>

          <PartnerLoginSection partnerId={partner.id} linkedEmail={linkedEmail} />
        </div>
      </div>
    </div>
  )
}
