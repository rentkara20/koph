import { getPaymentReview } from "@/lib/actions/payments"
import { getStaffSession } from "@/lib/auth/session"
import { getSheetLabels } from "@/lib/excel/labels"
import {
  buildReviewWorkbook,
  safeFilePart,
  workbookResponse,
} from "@/lib/excel/payment-workbook"

export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  // getPaymentReview returns empty arrays for an unauthenticated caller, which
  // would hand out a valid (empty) workbook instead of a refusal — check first.
  const session = await getStaffSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const url = new URL(request.url)
  const from = url.searchParams.get("from") ?? ""
  const to = url.searchParams.get("to") ?? ""
  // Same param name the review and finance-report pages use, so an export link
  // can be built by appending "/export" to the page's own query string.
  const partnerIds = url.searchParams.getAll("partnerId").filter(Boolean)

  const { payments } = await getPaymentReview({ from, to, partnerIds })

  const labels = await getSheetLabels()
  const workbook = buildReviewWorkbook({ from, to, payments }, labels)
  return workbookResponse(
    workbook,
    `partner-payments-${safeFilePart(from || "all")}-${safeFilePart(to || "all")}.xlsx`
  )
}
