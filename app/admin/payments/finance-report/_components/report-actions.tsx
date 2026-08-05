"use client"

import { Copy, Printer } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function ReportActions() {
  async function copyReport() {
    const report = document.getElementById("finance-report")
    if (!report) return
    await navigator.clipboard.writeText(report.innerText)
    toast.success("Report copied")
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={copyReport}>
        <Copy className="size-3.5" />
        Copy for email
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-3.5" />
        Print / PDF
      </Button>
    </div>
  )
}

export function ExportCsvButton({
  filename,
  rows,
}: {
  filename: string
  rows: Array<Record<string, string | number>>
}) {
  function exportCsv() {
    if (rows.length === 0) return
    const headers = Object.keys(rows[0])
    const csv = [
      headers,
      ...rows.map((row) => headers.map((header) => String(row[header] ?? ""))),
    ]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={exportCsv}>
      Download Excel CSV
    </Button>
  )
}
