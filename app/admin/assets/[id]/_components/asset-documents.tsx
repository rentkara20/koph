"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { FileText, Loader2, Trash2, Upload } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { uploadAssetDocument, deleteAssetDocument } from "@/lib/actions/asset-documents"
import { translateActionError } from "@/lib/i18n/action-errors"
import { formatDate } from "@/lib/utils/format"

type Document = {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  sensitivity: "sensitive" | "operational"
  createdAt: number
}

const DOCUMENT_KINDS = ["warranty_card", "invoice", "photo", "condition_report", "other"] as const

export function AssetDocuments({ assetId, documents }: { assetId: string; documents: Document[] }) {
  const t = useTranslations("assets")
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<(typeof DOCUMENT_KINDS)[number]>("other")
  const [sensitivity, setSensitivity] = useState<"sensitive" | "operational">("sensitive")
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.set("assetId", assetId)
    formData.set("file", file)
    formData.set("kind", kind)
    formData.set("sensitivity", sensitivity)

    setUploading(true)
    const result = await uploadAssetDocument(formData)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""

    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    toast.success(t("documentUploaded"))
    router.refresh()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const result = await deleteAssetDocument(id)
    setDeletingId(null)
    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }
    router.refresh()
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{t("documents")}</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="doc-kind" className="sr-only">
          {t("documentKind")}
        </label>
        <select
          id="doc-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof DOCUMENT_KINDS)[number])}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        >
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`documentKinds.${k}`)}
            </option>
          ))}
        </select>

        <label htmlFor="doc-sensitivity" className="sr-only">
          {t("sensitivity")}
        </label>
        <select
          id="doc-sensitivity"
          value={sensitivity}
          onChange={(e) => setSensitivity(e.target.value as "sensitive" | "operational")}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="sensitive">{t("sensitivityLevels.sensitive")}</option>
          <option value="operational">{t("sensitivityLevels.operational")}</option>
        </select>

        <label
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "cursor-pointer gap-1.5",
            uploading && "pointer-events-none opacity-50"
          )}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-3.5" aria-hidden />
          )}
          {t("uploadDocument")}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noDocuments")}</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{d.fileName}</span>
              </a>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2 py-0.5">
                  {t(`sensitivityLevels.${d.sensitivity}`)}
                </span>
                <span>{formatDate(d.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(d.id)}
                  disabled={deletingId === d.id}
                  aria-label={t("deleteDocument")}
                  className="text-destructive hover:opacity-70 disabled:opacity-40"
                >
                  {deletingId === d.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
