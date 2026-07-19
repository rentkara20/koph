import { notFound } from "next/navigation"
import { getProcurementCase, getProcurementCaseLineItems } from "@/lib/actions/procurement-case"
import { ProcurementCasePanel } from "@/components/procurement-case-panel"

export default async function ProcurementCasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getProcurementCase(id)
  if (!data) notFound()
  const lineItems = await getProcurementCaseLineItems(id)

  return (
    <div className="max-w-3xl">
      <ProcurementCasePanel
        procurementCase={data.procurementCase}
        linkedPurchaseOrders={data.linkedPurchaseOrders}
        sourceRequests={data.sourceRequests}
        lineItems={lineItems}
      />
    </div>
  )
}
