import ExcelJS from "exceljs"
import { formatDate } from "@/lib/utils/format"

// Excel stores dates without a timezone, so a JS Date written into a cell is
// re-interpreted by the reader's locale and can land on the previous day for a
// Riyadh business date. Every date in these sheets is therefore written as an
// already-formatted Riyadh string (see lib/utils/format.ts) — the sheet is a
// finance record, not a source for further date arithmetic.

const CURRENCY_FORMAT = '#,##0.00'
const HEADER_FILL = "FF4C1D95"
const TOTAL_FILL = "FFF3F0FF"

// The sheet vocabulary is passed in rather than looked up here so this module
// stays pure and testable — routes build it from next-intl (lib/excel/labels.ts).
export type SheetLabels = {
  sheetSummary: string
  sheetPayments: string
  batchTitle: string
  reviewTitle: string
  colDate: string
  colPartner: string
  colRequest: string
  colCustomer: string
  colStatus: string
  colService: string
  colDescription: string
  colSerial: string
  colDevice: string
  colPricingModel: string
  colQty: string
  colUnitPrice: string
  colNotes: string
  colTotal: string
  lblPartner: string
  lblPeriod: string
  lblStatus: string
  lblGenerated: string
  lblApproved: string
  lblSentToFinance: string
  lblPaid: string
  lblLines: string
  lblTotal: string
  lblFrom: string
  lblTo: string
  lblPartners: string
  valueStart: string
  valueToday: string
  batchStatus: (status: string) => string
  lineStatus: (status: string) => string
  pricingModel: (model: string) => string
  rtl: boolean
}

export type BatchSheetInput = {
  partnerName: string
  period: string
  status: string
  generatedAt: number | null
  approvedAt?: number | null
  sentAt?: number | null
  paidAt?: number | null
  payments: ReadonlyArray<{
    requestNumber: string | null
    pricingModel: string
    quantity: number
    unitPrice: number
    totalAmount: number
    status?: string | null
    createdAt?: number | null
  }>
}

export type ReviewSheetInput = {
  from: string
  to: string
  payments: ReadonlyArray<{
    createdAt: number
    partnerName: string | null
    requestNumber: string | null
    customerName: string | null
    status: string
    serviceType: string | null
    serviceDescription: string | null
    serialNumber: string | null
    deviceSpecs: string | null
    pricingModel: string
    quantity: number
    unitPrice: number
    totalAmount: number
    notes: string | null
  }>
}

type ColumnSpec = { header: string; key: string; width: number; currency?: boolean }

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
  row.alignment = { vertical: "middle" }
  row.height = 20
}

function applyColumns(
  sheet: ExcelJS.Worksheet,
  columns: ReadonlyArray<ColumnSpec>,
  rtl: boolean
): void {
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    style: column.currency ? { numFmt: CURRENCY_FORMAT } : undefined,
  }))
  styleHeaderRow(sheet.getRow(1))
  sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: rtl }]
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }
}

function addTotalRow(
  sheet: ExcelJS.Worksheet,
  columns: ReadonlyArray<ColumnSpec>,
  label: string,
  total: number
): void {
  const values: Record<string, string | number> = {}
  const totalColumn = columns[columns.length - 1]
  const labelColumn = columns[columns.length - 2]
  if (labelColumn) values[labelColumn.key] = label
  values[totalColumn.key] = total

  const row = sheet.addRow(values)
  row.font = { bold: true }
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } }
  })
}

function addMetaSheet(
  workbook: ExcelJS.Workbook,
  labels: SheetLabels,
  title: string,
  entries: ReadonlyArray<[string, string]>
): void {
  const sheet = workbook.addWorksheet(labels.sheetSummary)
  sheet.views = [{ rightToLeft: labels.rtl }]
  sheet.columns = [
    { key: "label", width: 26 },
    { key: "value", width: 40 },
  ]
  const heading = sheet.addRow([title])
  heading.font = { bold: true, size: 14 }
  sheet.addRow([])
  for (const [label, value] of entries) {
    const row = sheet.addRow({ label, value })
    row.getCell("label").font = { bold: true }
  }
}

function batchColumns(labels: SheetLabels): ReadonlyArray<ColumnSpec> {
  return [
    { header: labels.colDate, key: "date", width: 14 },
    { header: labels.colRequest, key: "request", width: 16 },
    { header: labels.colPricingModel, key: "pricingModel", width: 18 },
    { header: labels.colStatus, key: "status", width: 14 },
    { header: labels.colQty, key: "quantity", width: 8 },
    { header: labels.colUnitPrice, key: "unitPrice", width: 18, currency: true },
    { header: labels.colTotal, key: "totalAmount", width: 16, currency: true },
  ]
}

export function buildBatchWorkbook(
  input: BatchSheetInput,
  labels: SheetLabels
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "KOPH"

  const total = input.payments.reduce((sum, payment) => sum + payment.totalAmount, 0)

  addMetaSheet(workbook, labels, `${labels.batchTitle} — ${input.partnerName}`, [
    [labels.lblPartner, input.partnerName],
    [labels.lblPeriod, input.period],
    [labels.lblStatus, labels.batchStatus(input.status)],
    [labels.lblGenerated, formatDate(input.generatedAt)],
    [labels.lblApproved, formatDate(input.approvedAt)],
    [labels.lblSentToFinance, formatDate(input.sentAt)],
    [labels.lblPaid, formatDate(input.paidAt)],
    [labels.lblLines, String(input.payments.length)],
    [labels.lblTotal, total.toFixed(2)],
  ])

  const columns = batchColumns(labels)
  const sheet = workbook.addWorksheet(labels.sheetPayments)
  applyColumns(sheet, columns, labels.rtl)

  for (const payment of input.payments) {
    sheet.addRow({
      date: formatDate(payment.createdAt),
      request: payment.requestNumber ?? "—",
      pricingModel: labels.pricingModel(payment.pricingModel),
      status: payment.status ? labels.lineStatus(payment.status) : "—",
      quantity: payment.quantity,
      unitPrice: payment.unitPrice,
      totalAmount: payment.totalAmount,
    })
  }

  addTotalRow(sheet, columns, labels.lblTotal, total)
  return workbook
}

function reviewColumns(labels: SheetLabels): ReadonlyArray<ColumnSpec> {
  return [
    { header: labels.colDate, key: "date", width: 14 },
    { header: labels.colPartner, key: "partner", width: 24 },
    { header: labels.colRequest, key: "request", width: 16 },
    { header: labels.colCustomer, key: "customer", width: 24 },
    { header: labels.colStatus, key: "status", width: 14 },
    { header: labels.colService, key: "serviceType", width: 16 },
    { header: labels.colDescription, key: "serviceDescription", width: 30 },
    { header: labels.colSerial, key: "serialNumber", width: 20 },
    { header: labels.colDevice, key: "deviceSpecs", width: 26 },
    { header: labels.colPricingModel, key: "pricingModel", width: 18 },
    { header: labels.colQty, key: "quantity", width: 8 },
    { header: labels.colUnitPrice, key: "unitPrice", width: 18, currency: true },
    { header: labels.colNotes, key: "notes", width: 30 },
    { header: labels.colTotal, key: "totalAmount", width: 16, currency: true },
  ]
}

export function buildReviewWorkbook(
  input: ReviewSheetInput,
  labels: SheetLabels
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "KOPH"

  const total = input.payments.reduce((sum, payment) => sum + payment.totalAmount, 0)
  const partnerTotals = new Map<string, number>()
  for (const payment of input.payments) {
    const name = payment.partnerName ?? "—"
    partnerTotals.set(name, (partnerTotals.get(name) ?? 0) + payment.totalAmount)
  }

  addMetaSheet(workbook, labels, labels.reviewTitle, [
    [labels.lblFrom, input.from || labels.valueStart],
    [labels.lblTo, input.to || labels.valueToday],
    [labels.lblPartners, String(partnerTotals.size)],
    [labels.lblLines, String(input.payments.length)],
    [labels.lblTotal, total.toFixed(2)],
    ...[...partnerTotals.entries()].map(
      ([name, amount]) => [name, amount.toFixed(2)] as [string, string]
    ),
  ])

  const columns = reviewColumns(labels)
  const sheet = workbook.addWorksheet(labels.sheetPayments)
  applyColumns(sheet, columns, labels.rtl)

  for (const payment of input.payments) {
    sheet.addRow({
      date: formatDate(payment.createdAt),
      partner: payment.partnerName ?? "—",
      request: payment.requestNumber ?? "—",
      customer: payment.customerName ?? "—",
      status: labels.lineStatus(payment.status),
      serviceType: payment.serviceType ?? "—",
      serviceDescription: payment.serviceDescription ?? "",
      serialNumber: payment.serialNumber ?? "",
      deviceSpecs: payment.deviceSpecs ?? "",
      pricingModel: labels.pricingModel(payment.pricingModel),
      quantity: payment.quantity,
      unitPrice: payment.unitPrice,
      notes: payment.notes ?? "",
      totalAmount: payment.totalAmount,
    })
  }

  addTotalRow(sheet, columns, labels.lblTotal, total)
  return workbook
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function workbookResponse(
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<Response> {
  const buffer = await workbook.xlsx.writeBuffer()
  // Partner names are Arabic, and a raw non-latin1 byte in a header throws
  // ("Invalid character in header content"). RFC 5987 filename* carries the
  // real name; the quoted filename stays ASCII for older clients.
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_")
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  })
}

export function safeFilePart(value: string | null | undefined): string {
  return (value ?? "export").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "export"
}
