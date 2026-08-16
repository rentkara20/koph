import { getLocale, getTranslations } from "next-intl/server"
import type { SheetLabels } from "./payment-workbook"

// Builds the sheet vocabulary in the viewer's locale. Falls back to the raw key
// for an unknown status or pricing model rather than throwing — a workbook that
// says "per_week" is still a usable finance record, a 500 is not.
export async function getSheetLabels(): Promise<SheetLabels> {
  const [locale, tPay, tExcel, tBatchStatus, tLineStatus, tModels] = await Promise.all([
    getLocale(),
    getTranslations("payments"),
    getTranslations("payments.excel"),
    getTranslations("payments.batchStatus"),
    getTranslations("payments.lineStatus"),
    getTranslations("partners.pricingModels"),
  ])

  const safe = (translate: (key: string) => string) => (key: string) => {
    if (!key) return "—"
    try {
      return translate(key)
    } catch {
      return key.replace(/_/g, " ")
    }
  }

  return {
    sheetSummary: tExcel("sheetSummary"),
    sheetPayments: tExcel("sheetPayments"),
    batchTitle: tExcel("batchTitle"),
    reviewTitle: tExcel("reviewTitle"),
    colDate: tExcel("colDate"),
    colPartner: tPay("partner"),
    colRequest: tPay("request"),
    colCustomer: tExcel("colCustomer"),
    colStatus: tExcel("colStatus"),
    colService: tExcel("colService"),
    colDescription: tExcel("colDescription"),
    colSerial: tExcel("colSerial"),
    colDevice: tExcel("colDevice"),
    colPricingModel: tExcel("colPricingModel"),
    colQty: tPay("qty"),
    colUnitPrice: tPay("unitSar"),
    colNotes: tExcel("colNotes"),
    colTotal: tPay("totalSar"),
    lblPartner: tPay("partner"),
    lblPeriod: tExcel("lblPeriod"),
    lblStatus: tExcel("colStatus"),
    lblGenerated: tExcel("lblGenerated"),
    lblApproved: tExcel("lblApproved"),
    lblSentToFinance: tExcel("lblSentToFinance"),
    lblPaid: tExcel("lblPaid"),
    lblLines: tExcel("lblLines"),
    lblTotal: tPay("totalSar"),
    lblFrom: tExcel("lblFrom"),
    lblTo: tExcel("lblTo"),
    lblPartners: tExcel("lblPartners"),
    valueStart: tExcel("valueStart"),
    valueToday: tExcel("valueToday"),
    batchStatus: safe(tBatchStatus),
    lineStatus: safe(tLineStatus),
    pricingModel: safe(tModels),
    rtl: locale === "ar",
  }
}
