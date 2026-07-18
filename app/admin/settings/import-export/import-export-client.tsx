"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Download, FileSpreadsheet, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ModuleKey =
  | "asset"
  | "customer"
  | "order"
  | "supplier"
  | "partner"
  | "warrantyProduct"
  | "warrantyBatch"
  | "request"
  | "warrantyAssignment"
  | "productForSale"

const MODULE_KEYS: { key: ModuleKey; exportOnly?: boolean }[] = [
  { key: "asset" },
  { key: "customer" },
  { key: "order" },
  { key: "supplier" },
  { key: "partner" },
  { key: "warrantyProduct" },
  { key: "warrantyBatch" },
  { key: "request", exportOnly: true },
  { key: "warrantyAssignment", exportOnly: true },
  { key: "productForSale", exportOnly: true },
]

type ImportRow = {
  rowNumber: number
  raw: Record<string, string>
  classification: "new" | "update" | "error"
  error?: string
}

type PreviewSummary = {
  batchId: string
  totalRows: number
  newRows: number
  updateRows: number
  errorRows: number
  sample: ImportRow[]
  truncated: boolean
}

type CommitSummary = {
  batchId: string
  totalRows: number
  successRows: number
  errorRows: number
  status: "committed" | "failed"
  error?: string
}

export function ImportExportClient({ initialModule }: { initialModule: ModuleKey }) {
  const t = useTranslations("importExport")
  const router = useRouter()
  const [active, setActive] = useState<ModuleKey>(initialModule)
  const activeModule = MODULE_KEYS.find((m) => m.key === active)
  const [preview, setPreview] = useState<PreviewSummary | null>(null)
  const [commitResult, setCommitResult] = useState<CommitSummary | null>(null)
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function selectModule(key: ModuleKey) {
    setActive(key)
    setPreview(null)
    setCommitResult(null)
    setError(null)
    router.replace(`/admin/settings/import-export?module=${key}`, { scroll: false })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setCommitResult(null)
    setBusy("preview")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/admin/import-export/${active}/preview`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t("failedToProcessFile"))
        setPreview(null)
      } else {
        setPreview(data as PreviewSummary)
      }
    } catch {
      setError(t("failedToProcessFile"))
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleConfirmImport() {
    if (!preview) return
    setBusy("commit")
    setError(null)
    try {
      const res = await fetch(`/api/admin/import-export/${active}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t("commitFailed"))
      } else {
        setCommitResult(data as CommitSummary)
        setPreview(null)
      }
    } catch {
      setError(t("commitFailed"))
    } finally {
      setBusy(null)
    }
  }

  const newRows = preview?.sample.filter((r) => r.classification === "new") ?? []
  const updateRows = preview?.sample.filter((r) => r.classification === "update") ?? []
  const errorRows = preview?.sample.filter((r) => r.classification === "error") ?? []

  return (
    <div className="space-y-6">
      {/* Module selector */}
      <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/30 p-1">
        {MODULE_KEYS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => selectModule(m.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === m.key
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`modules.${m.key}`)}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t(`modules.${active}`)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/import-export/${active}/export`}>
              <Button variant="outline" size="sm">
                <Download className="size-3.5" />
                {t("exportCsv")}
              </Button>
            </a>
            {!activeModule?.exportOnly && (
              <>
                <a href={`/api/admin/import-export/${active}/template`}>
                  <Button variant="outline" size="sm">
                    <FileSpreadsheet className="size-3.5" />
                    {t("downloadTemplate")}
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {busy === "preview" ? t("processing") : t("uploadCsv")}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>

          {activeModule?.exportOnly && (
            <p className="text-sm text-muted-foreground">{t("exportOnlyNotice")}</p>
          )}


          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {commitResult && (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                commitResult.status === "committed"
                  ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              {commitResult.status === "committed"
                ? t("importCompleteMessage", {
                    success: commitResult.successRows,
                    total: commitResult.totalRows,
                  })
                : t("importFailedMessage", { error: commitResult.error ?? "" })}
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="secondary">{t("rowsTotal", { count: preview.totalRows })}</Badge>
                <Badge variant="success">{t("newCount", { count: preview.newRows })}</Badge>
                <Badge variant="info">{t("updateCount", { count: preview.updateRows })}</Badge>
                <Badge variant={preview.errorRows > 0 ? "destructive" : "outline"}>
                  {t("errorCount", { count: preview.errorRows })}
                </Badge>
              </div>
              {preview.truncated && (
                <p className="text-xs text-muted-foreground">
                  {t("showingFirstRows", {
                    shown: preview.sample.length,
                    total: preview.totalRows,
                  })}
                </p>
              )}

              <PreviewTable title={t("newSection")} errorLabel={t("errorColumn")} rowNumberLabel={t("rowNumberColumn")} rows={newRows} />
              <PreviewTable title={t("updateSection")} errorLabel={t("errorColumn")} rowNumberLabel={t("rowNumberColumn")} rows={updateRows} />
              <PreviewTable title={t("errorsSection")} errorLabel={t("errorColumn")} rowNumberLabel={t("rowNumberColumn")} rows={errorRows} showError />

              <Button
                onClick={handleConfirmImport}
                disabled={busy !== null || preview.newRows + preview.updateRows === 0}
              >
                {busy === "commit"
                  ? t("importing")
                  : t("confirmImport", { count: preview.newRows + preview.updateRows })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PreviewTable({
  title,
  rows,
  showError,
  errorLabel,
  rowNumberLabel,
}: {
  title: string
  rows: ImportRow[]
  showError?: boolean
  errorLabel: string
  rowNumberLabel: string
}) {
  if (rows.length === 0) return null
  const columns = Object.keys(rows[0].raw)

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {title} ({rows.length})
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">{rowNumberLabel}</th>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-start font-medium text-muted-foreground">
                  {c}
                </th>
              ))}
              {showError && (
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">{errorLabel}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.rowNumber}>
                <td className="px-3 py-1.5 text-muted-foreground">{r.rowNumber}</td>
                {columns.map((c) => (
                  <td key={c} className="px-3 py-1.5">
                    {r.raw[c]}
                  </td>
                ))}
                {showError && <td className="px-3 py-1.5 text-destructive">{r.error}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
