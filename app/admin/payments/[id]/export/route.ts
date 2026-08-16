import { getBatchWithPayments } from "@/lib/actions/payments"
import { getSheetLabels } from "@/lib/excel/labels"
import {
  buildBatchWorkbook,
  safeFilePart,
  workbookResponse,
} from "@/lib/excel/payment-workbook"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params

  // getBatchWithPayments already enforces the staff session and returns null
  // for both "not signed in" and "no such batch" — keep the same 404 shape so
  // the route cannot be used to probe which batch ids exist.
  const data = await getBatchWithPayments(id)
  if (!data) return new Response("Not found", { status: 404 })

  const { batch, payments } = data
  const labels = await getSheetLabels()
  const workbook = buildBatchWorkbook({
    partnerName: batch.partnerName ?? "—",
    period: batch.period,
    status: batch.status,
    generatedAt: batch.generatedAt,
    approvedAt: batch.approvedAt,
    sentAt: batch.sentAt,
    paidAt: batch.paidAt,
    payments,
  }, labels)

  return workbookResponse(
    workbook,
    `batch-${safeFilePart(batch.partnerName)}-${batch.period}.xlsx`
  )
}
