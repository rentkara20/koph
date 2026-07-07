import { useTranslations } from "next-intl"
import type { Supplier } from "@/lib/db/schema"
import { DetailField, DetailGrid } from "@/components/detail-field"

export function SupplierView({ supplier }: { supplier: Supplier }) {
  const t = useTranslations("suppliers")
  const tCommon = useTranslations("common")

  return (
    <DetailGrid>
      <DetailField label={t("name")} value={supplier.name} span />
      <DetailField label={t("contactPerson")} value={supplier.contactPerson} />
      <DetailField label={t("mobile")} value={supplier.mobile} />
      <DetailField label={t("email")} value={supplier.email} />
      <DetailField label={t("city")} value={supplier.city} />
      <DetailField label={t("address")} value={supplier.address} span />
      <DetailField label={tCommon("notes")} value={supplier.notes} span />
    </DetailGrid>
  )
}
