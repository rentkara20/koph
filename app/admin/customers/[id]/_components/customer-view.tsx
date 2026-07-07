import { useTranslations } from "next-intl"
import { ExternalLink } from "lucide-react"
import type { Customer } from "@/lib/db/schema"
import { DetailField, DetailGrid } from "@/components/detail-field"

export function CustomerView({ customer }: { customer: Customer }) {
  const t = useTranslations("customers")
  const tCommon = useTranslations("common")

  return (
    <DetailGrid>
      <DetailField label={t("name")} value={customer.name} span />
      <DetailField label={t("contactPerson")} value={customer.contactPerson} />
      <DetailField label={t("mobile")} value={customer.mobile} />
      <DetailField label={t("email")} value={customer.email} />
      <DetailField label={t("city")} value={customer.city} />
      <DetailField label={t("address")} value={customer.address} span />
      <DetailField
        label={t("mapsLink")}
        span
        value={
          customer.mapsLink && (
            <a
              href={customer.mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-kara-purple hover:underline"
            >
              {t("mapsLink")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )
        }
      />
      <DetailField label={tCommon("notes")} value={customer.notes} span />
    </DetailGrid>
  )
}
