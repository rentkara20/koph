import { notFound } from "next/navigation"
import { getDeliveryNoteData } from "@/lib/actions/delivery-notes"
import { DeliveryNoteView } from "../_components/delivery-note-view"
import { PrintActions } from "./_components/print-actions"

export default async function PrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getDeliveryNoteData(token)

  if (!data) notFound()

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

      <PrintActions />
      <DeliveryNoteView data={data} />
    </>
  )
}
