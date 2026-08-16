import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import {
  buildBatchWorkbook,
  buildReviewWorkbook,
  safeFilePart,
  type ReviewSheetInput,
  type SheetLabels,
} from "./payment-workbook"

// Mirrors what lib/excel/labels.ts produces from next-intl, without pulling the
// server-only translator into a unit test.
const EN: SheetLabels = {
  sheetSummary: "Summary",
  sheetPayments: "Payments",
  batchTitle: "Partner payment batch",
  reviewTitle: "Partner services payment sheet",
  colDate: "Date",
  colPartner: "Partner",
  colRequest: "Request",
  colCustomer: "Customer",
  colStatus: "Status",
  colService: "Service",
  colDescription: "Description",
  colSerial: "Serial",
  colDevice: "Device",
  colPricingModel: "Pricing model",
  colQty: "Qty",
  colUnitPrice: "Unit (SAR)",
  colNotes: "Notes",
  colTotal: "Total (SAR)",
  lblPartner: "Partner",
  lblPeriod: "Period",
  lblStatus: "Status",
  lblGenerated: "Generated",
  lblApproved: "Approved",
  lblSentToFinance: "Sent to finance",
  lblPaid: "Paid",
  lblLines: "Payment lines",
  lblTotal: "Total (SAR)",
  lblFrom: "Period from",
  lblTo: "Period to",
  lblPartners: "Partners",
  valueStart: "Start",
  valueToday: "Today",
  batchStatus: (status) => ({ draft: "Draft", sent_to_finance: "Sent to finance" })[status] ?? status,
  lineStatus: (status) => ({ pending: "Pending", batched: "In batch" })[status] ?? status,
  pricingModel: (model) => ({ per_order: "Per order", per_device: "Per device" })[model] ?? model,
  rtl: false,
}

const AR: SheetLabels = {
  ...EN,
  sheetSummary: "ملخص",
  sheetPayments: "المدفوعات",
  colTotal: "الإجمالي (ريال)",
  lblTotal: "الإجمالي (ريال)",
  lineStatus: (status) => ({ pending: "معلّق", batched: "ضمن دفعة" })[status] ?? status,
  pricingModel: (model) => ({ per_order: "لكل طلب" })[model] ?? model,
  rtl: true,
}

const RIYADH_MIDNIGHT_UTC = Date.UTC(2026, 6, 18, 21, 30) // 19 Jul 2026 00:30 Riyadh

function reviewLine(
  overrides: Partial<ReviewSheetInput["payments"][number]> = {}
): ReviewSheetInput["payments"][number] {
  return {
    createdAt: RIYADH_MIDNIGHT_UTC,
    partnerName: "QA Courier Partner",
    requestNumber: "R-1",
    customerName: "Acme",
    status: "pending",
    serviceType: "Delivery",
    serviceDescription: "from RUH to JED",
    serialNumber: "SN-1",
    deviceSpecs: "Latitude 5440",
    pricingModel: "per_order",
    quantity: 1,
    unitPrice: 150,
    totalAmount: 150,
    notes: null,
    ...overrides,
  }
}

// After a write/load round-trip ExcelJS drops the column keys, so cells are
// addressed by their header text — which is also what the finance team sees.
function cell(sheet: ExcelJS.Worksheet, rowNumber: number, header: string): ExcelJS.CellValue {
  const headers = sheet.getRow(1).values as ExcelJS.CellValue[]
  const index = headers.findIndex((value) => value === header)
  if (index < 1) throw new Error(`no such column: ${header}`)
  return sheet.getRow(rowNumber).getCell(index).value
}

function cellObject(sheet: ExcelJS.Worksheet, rowNumber: number, header: string): ExcelJS.Cell {
  const headers = sheet.getRow(1).values as ExcelJS.CellValue[]
  const index = headers.findIndex((value) => value === header)
  if (index < 1) throw new Error(`no such column: ${header}`)
  return sheet.getRow(rowNumber).getCell(index)
}

async function reload(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await workbook.xlsx.writeBuffer()
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(buffer as ArrayBuffer)
  return reopened
}

describe("buildBatchWorkbook", () => {
  it("writes one row per payment plus a totals row", async () => {
    const workbook = await reload(
      buildBatchWorkbook({
        partnerName: "QA Courier Partner",
        period: "2026-07",
        status: "sent_to_finance",
        generatedAt: RIYADH_MIDNIGHT_UTC,
        payments: [
          { requestNumber: "R-1", pricingModel: "per_order", quantity: 1, unitPrice: 100, totalAmount: 100 },
          { requestNumber: "R-2", pricingModel: "per_device", quantity: 2, unitPrice: 25, totalAmount: 50 },
        ],
      }, EN)
    )

    const sheet = workbook.getWorksheet("Payments")!
    // header + 2 payments + total
    expect(sheet.rowCount).toBe(4)
    expect(cell(sheet, 4, "Total (SAR)")).toBe(150)
  })

  it("keeps amounts as numbers so Excel can sum them", async () => {
    const workbook = await reload(
      buildBatchWorkbook({
        partnerName: "P",
        period: "2026-07",
        status: "draft",
        generatedAt: null,
        payments: [
          { requestNumber: null, pricingModel: "per_order", quantity: 1, unitPrice: 12.5, totalAmount: 12.5 },
        ],
      }, EN)
    )

    const totalCell = cellObject(workbook.getWorksheet("Payments")!, 2, "Total (SAR)")
    expect(typeof totalCell.value).toBe("number")
    expect(totalCell.numFmt).toBe("#,##0.00")
  })

  it("renders dates in Riyadh, not UTC", async () => {
    const workbook = await reload(
      buildBatchWorkbook({
        partnerName: "P",
        period: "2026-07",
        status: "draft",
        generatedAt: RIYADH_MIDNIGHT_UTC,
        payments: [
          {
            requestNumber: "R-1",
            pricingModel: "per_order",
            quantity: 1,
            unitPrice: 1,
            totalAmount: 1,
            createdAt: RIYADH_MIDNIGHT_UTC,
          },
        ],
      }, EN)
    )

    // 18 Jul 21:30 UTC is already 19 Jul in Riyadh — the sheet must say 19.
    expect(cell(workbook.getWorksheet("Payments")!, 2, "Date")).toBe("19 Jul 2026")
  })

  it("carries the batch metadata on the summary sheet", async () => {
    const workbook = await reload(
      buildBatchWorkbook({
        partnerName: "QA Courier Partner",
        period: "2026-07",
        status: "sent_to_finance",
        generatedAt: RIYADH_MIDNIGHT_UTC,
        payments: [
          { requestNumber: "R-1", pricingModel: "per_order", quantity: 1, unitPrice: 100, totalAmount: 100 },
        ],
      }, EN)
    )

    const summary = workbook.getWorksheet("Summary")!
    const values: string[] = []
    summary.eachRow((row) => values.push(String(row.getCell(2).value ?? "")))
    expect(values).toContain("QA Courier Partner")
    expect(values).toContain("2026-07")
    expect(values).toContain("Sent to finance")
    expect(values).toContain("100.00")
  })

  it("produces an empty sheet without throwing when a batch has no lines", async () => {
    const workbook = await reload(
      buildBatchWorkbook({
        partnerName: "P",
        period: "2026-07",
        status: "draft",
        generatedAt: null,
        payments: [],
      }, EN)
    )

    const sheet = workbook.getWorksheet("Payments")!
    expect(sheet.rowCount).toBe(2) // header + zero total
    expect(cell(sheet, 2, "Total (SAR)")).toBe(0)
  })
})

describe("buildReviewWorkbook", () => {
  it("totals every line and breaks the total down per partner", async () => {
    const workbook = await reload(
      buildReviewWorkbook({
        from: "2026-07-01",
        to: "2026-07-31",
        payments: [
          reviewLine({ partnerName: "A", totalAmount: 150 }),
          reviewLine({ partnerName: "A", totalAmount: 50 }),
          reviewLine({ partnerName: "B", totalAmount: 100 }),
        ],
      }, EN)
    )

    const sheet = workbook.getWorksheet("Payments")!
    expect(sheet.rowCount).toBe(5) // header + 3 lines + total
    expect(cell(sheet, 5, "Total (SAR)")).toBe(300)

    const summary = workbook.getWorksheet("Summary")!
    const rows = new Map<string, string>()
    summary.eachRow((row) => {
      rows.set(String(row.getCell(1).value ?? ""), String(row.getCell(2).value ?? ""))
    })
    expect(rows.get("A")).toBe("200.00")
    expect(rows.get("B")).toBe("100.00")
  })

  it("keeps a null customer or note out of the cell as blank, not the string null", async () => {
    const workbook = await reload(
      buildReviewWorkbook({
        from: "",
        to: "",
        payments: [reviewLine({ customerName: null, notes: null, requestNumber: null })],
      }, EN)
    )

    const sheet = workbook.getWorksheet("Payments")!
    expect(cell(sheet, 2, "Customer")).toBe("—")
    expect(cell(sheet, 2, "Notes") ?? "").toBe("")
  })
})

describe("Arabic sheets", () => {
  it("translates sheet names, headers and statuses, and flips the sheet to RTL", async () => {
    const workbook = await reload(
      buildBatchWorkbook(
        {
          partnerName: "شركة كارا",
          period: "2026-07",
          status: "draft",
          generatedAt: RIYADH_MIDNIGHT_UTC,
          payments: [
            {
              requestNumber: "R-1",
              pricingModel: "per_order",
              quantity: 1,
              unitPrice: 100,
              totalAmount: 100,
              status: "batched",
            },
          ],
        },
        AR
      )
    )

    const sheet = workbook.getWorksheet("المدفوعات")!
    expect(workbook.getWorksheet("ملخص")).toBeDefined()
    expect(sheet.views[0].rightToLeft).toBe(true)
    expect(cell(sheet, 2, "الإجمالي (ريال)")).toBe(100)

    const row = sheet.getRow(2).values as ExcelJS.CellValue[]
    expect(row).toContain("ضمن دفعة")
    expect(row).toContain("لكل طلب")
  })

  it("falls back to the raw key for a status the messages file does not cover", async () => {
    const workbook = await reload(
      buildBatchWorkbook(
        {
          partnerName: "P",
          period: "2026-07",
          status: "draft",
          generatedAt: null,
          payments: [
            {
              requestNumber: "R-1",
              pricingModel: "per_week",
              quantity: 1,
              unitPrice: 1,
              totalAmount: 1,
              status: "on_hold",
            },
          ],
        },
        AR
      )
    )

    const row = workbook.getWorksheet("المدفوعات")!.getRow(2).values as ExcelJS.CellValue[]
    expect(row).toContain("per_week")
    expect(row).toContain("on_hold")
  })
})

describe("safeFilePart", () => {
  it("strips characters that would break a Content-Disposition filename", () => {
    expect(safeFilePart('QA "Courier"/Partner')).toBe("QA-Courier-Partner")
  })

  it("keeps Arabic partner names readable", () => {
    expect(safeFilePart("شركة كارا")).toBe("شركة-كارا")
  })

  it("falls back to a constant when nothing usable is left", () => {
    expect(safeFilePart("///")).toBe("export")
    expect(safeFilePart(null)).toBe("export")
  })
})
