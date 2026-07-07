import { useTranslations } from "next-intl"
import type { Partner } from "@/lib/db/schema"
import { DetailField, DetailGrid } from "@/components/detail-field"
import { Badge } from "@/components/ui/badge"

export function PartnerView({ partner }: { partner: Partner }) {
  const tCommon = useTranslations("common")

  return (
    <DetailGrid>
      <DetailField label="Name" value={partner.name} span />
      <DetailField label="Contact person" value={partner.contactPerson} />
      <DetailField label="Mobile" value={partner.mobile} />
      <DetailField label="Email" value={partner.email} />
      <DetailField label="City" value={partner.city} />
      <DetailField
        label="Status"
        value={
          <Badge variant={partner.status === "active" ? "success" : "secondary"}>
            {partner.status === "active" ? "Active" : "Inactive"}
          </Badge>
        }
      />
      <DetailField label={tCommon("notes")} value={partner.notes} span />
    </DetailGrid>
  )
}
