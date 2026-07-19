import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getDeliveryNoteData } from "@/lib/actions/delivery-notes"
import { getSignatureByToken } from "@/lib/actions/signatures"
import { DeliveryNoteView } from "../_components/delivery-note-view"
import { PrintActions } from "./_components/print-actions"

const BLOCKED_STATUSES = new Set(["draft", "rejected", "cancelled", "expired"])

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const data = await getDeliveryNoteData(token)
  return { title: data?.sig.documentName ?? "Delivery Note" }
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [tokenData, data] = await Promise.all([
    getSignatureByToken(token),
    getDeliveryNoteData(token),
  ])

  if (!tokenData || !data) notFound()

  // Mirror the terminal-state gating on /sign/[token]: an expired, draft,
  // rejected, or cancelled token must not render PII via the print route.
  if (tokenData.isExpired || BLOCKED_STATUSES.has(tokenData.sig.status)) {
    notFound()
  }

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #fff; }
        @media screen {
          body { padding: 24px; background: #f5f5f5; }
          #delivery-note-root { max-width: 800px; margin: 0 auto; }
          .print-actions-bar {
            max-width: 800px;
            margin: 0 auto 16px;
            display: flex;
            gap: 10px;
          }
        }
        @media print {
          .print-actions-bar { display: none !important; }
          body { padding: 0; background: #fff; }
          #delivery-note-root {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          @page { margin: 0; size: A4 landscape; }
        }
      `}</style>

      <PrintActions documentName={data.sig.documentName} />
      <DeliveryNoteView data={data} />
    </>
  )
}
