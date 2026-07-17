import { notFound } from "next/navigation"
import { getPurchaseOrder } from "@/lib/actions/procurement"
import { MobileReceiving } from "./mobile-receiving"

export default async function MobileReceivingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pickupTaskId?: string }>
}) {
  const [{ id }, { pickupTaskId }] = await Promise.all([params, searchParams])
  const data = await getPurchaseOrder(id)
  if (!data) notFound()

  const receivingLines = data.lines
    .filter((line) => line.status !== "cancelled")
    .map((line) => ({
      id: line.id,
      description: line.itemDescription,
      brand: line.brand,
      model: line.model,
      ordered: line.qtyOrdered,
      received: line.qtyReceived,
    }))

  return (
    <MobileReceiving
      purchaseOrderId={data.po.id}
      poNumber={data.po.poNumber}
      supplierName={data.po.supplierName}
      qcRequired={data.po.qcRequired}
      linkedOrderNumber={data.linkedOrder?.orderNumber ?? null}
      pickupTaskId={pickupTaskId}
      initialLines={receivingLines}
    />
  )
}
