// The refundable security deposit, shown to the customer BEFORE they sign.
//
// The printed delivery note carries this block too (DeliveryNoteView), but that
// view only renders after signing. A customer must be able to read what they
// are agreeing to pay, so the same frozen numbers are surfaced here in the
// signing page's own visual language.

import {
  computeDepositTotal,
  DEPOSIT_REFUND_TERMS_AR,
  DEPOSIT_REFUND_TERMS_EN,
  type DepositNote,
} from "@/lib/domain/deposit-note"

function fmtAmount(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function DepositSummaryCard({ depositNote }: { depositNote: DepositNote }) {
  const lines = depositNote.lines
  const note = depositNote.note?.trim() || null
  if (lines.length === 0 && !note) return null

  const total = computeDepositTotal(lines)

  return (
    <section className="overflow-hidden rounded-xl border border-kara-purple/25 bg-card">
      <header className="bg-kara-purple/10 px-4 py-3">
        <h2 className="text-sm font-bold text-kara-purple">{depositNote.title}</h2>
      </header>

      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-2 text-start">Device / الجهاز</th>
                <th className="w-[30%] px-4 py-2 text-end">Amount / المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={line.itemId}
                  className={`border-b border-border ${idx % 2 ? "bg-muted/30" : ""}`}
                >
                  <td className="px-4 py-2.5 align-top text-foreground">{line.label}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-end align-top font-semibold text-foreground">
                    {fmtAmount(line.amount)} {depositNote.currency}
                  </td>
                </tr>
              ))}
              {depositNote.showTotal && (
                <tr className="border-t-2 border-border bg-muted/50">
                  <td className="px-4 py-2 text-end text-sm font-bold text-foreground">
                    Total Deposit&nbsp;/&nbsp;إجمالي التأمين
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-end text-base font-extrabold text-kara-purple">
                    {fmtAmount(total)} {depositNote.currency}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {depositNote.showRefundTerms && (
        <div className="space-y-1 border-t border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>{DEPOSIT_REFUND_TERMS_EN}</p>
          <p dir="rtl">{DEPOSIT_REFUND_TERMS_AR}</p>
        </div>
      )}

      {note && (
        <p className="whitespace-pre-wrap border-t border-dotted border-border px-4 py-3 text-xs italic text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  )
}
