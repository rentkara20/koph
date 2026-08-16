import { getBatchByStatementToken } from "@/lib/actions/payments"
import { getSheetLabels } from "@/lib/excel/labels"
import {
  buildBatchWorkbook,
  safeFilePart,
  workbookResponse,
} from "@/lib/excel/payment-workbook"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params

  // Same gate as the statement page itself: the token is the credential, and
  // getBatchByStatementToken carries the rate limit for token guessing.
  const data = await getBatchByStatementToken(token)
  if (!data) return new Response("Not found", { status: 404 })

  const { batch, payments } = data
  const labels = await getSheetLabels()
  const workbook = buildBatchWorkbook({
    partnerName: batch.partnerName ?? "—",
    period: batch.period,
    status: batch.status,
    generatedAt: batch.generatedAt,
    paidAt: batch.paidAt,
    payments,
  }, labels)

  return workbookResponse(
    workbook,
    `statement-${safeFilePart(batch.partnerName)}-${batch.period}.xlsx`
  )
}
