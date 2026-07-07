import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getSupplier, deleteSupplier } from "@/lib/actions/suppliers"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SupplierEditForm } from "./_components/supplier-edit-form"
import { SupplierView } from "./_components/supplier-view"
import { DeleteButton } from "@/components/delete-button"
import { EditableSection } from "@/components/editable-section"
import { cn } from "@/lib/utils"

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [t, supplier] = await Promise.all([getTranslations("common"), getSupplier(id)])

  if (!supplier) notFound()

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/suppliers"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{supplier.name}</h1>
        </div>
        <DeleteButton
          onDelete={deleteSupplier.bind(null, id)}
          redirectTo="/admin/suppliers"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("edit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditableSection
            editLabel={t("edit")}
            view={<SupplierView supplier={supplier} />}
            edit={<SupplierEditForm supplier={supplier} />}
          />
        </CardContent>
      </Card>
    </div>
  )
}
