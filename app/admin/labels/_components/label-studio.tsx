"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { registerLabelBatch, validateLabelUpload } from "@/lib/actions/label-studio"
import {
  MAX_SERIAL_LEN,
  labelZpl,
  type ParsedRow,
  type RowIssue,
} from "@/lib/domain/label-studio"
import { canvasToMono } from "@/lib/labels/render"
import {
  checkLabelSize,
  DEFAULT_LABEL_HEIGHT_MM,
  DEFAULT_LABEL_WIDTH_MM,
  DEFAULT_PROFILE_ID,
  getProfile,
  labelDots,
  MIN_LABEL_HEIGHT_MM,
  MIN_LABEL_WIDTH_MM,
  PRINTER_PROFILES,
  type SizeProblem,
} from "@/lib/domain/printer-profiles"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LabelPreview } from "./label-preview"
import { useLabelZoom, ZoomControl } from "./zoom-control"

/**
 * Excel and Google Sheets put TABS between columns when copied. Converting
 * them to commas lets a straight paste work without asking the operator to
 * save a CSV first.
 */
function normalisePasted(text: string): string {
  return text.includes("\t") ? text.replace(/\t/g, ",") : text
}

const SIZE_PROBLEM_TEXT: Record<SizeProblem, (max: number) => string> = {
  too_narrow: () => `العرض أقل من أدنى مقاس تقبله الطابعة (${MIN_LABEL_WIDTH_MM} مم)`,
  too_short: () => `الطول أقل من أدنى مقاس تقبله الطابعة (${MIN_LABEL_HEIGHT_MM} مم)`,
  wider_than_head: (max) => `العرض أكبر من عرض رأس الطباعة (${max} مم) — الجانب الأيمن سيُقطع`,
}

const ISSUE_TEXT: Record<RowIssue, string> = {
  empty: "سيريال فاضي",
  too_long: `أطول من ${MAX_SERIAL_LEN} حرف — لن يظهر كاملاً`,
  no_alnum: "لا يحتوي حروف أو أرقام صالحة",
  duplicate_in_file: "مكرر داخل الملف",
  already_exists: "مسجّل بالفعل — سيصبح للجهاز ملصقان",
}

/** Preview batches: rendering 200 canvases at once locks the tab. */
const PREVIEW_STEP = 12

export function LabelStudio({ baseUrl }: { baseUrl: string }) {
  const router = useRouter()
  const zoomState = useLabelZoom()

  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID)
  // The physical stock size is entered, never assumed — a wrong guess here is
  // a whole roll of unusable labels.
  const [widthMm, setWidthMm] = useState(DEFAULT_LABEL_WIDTH_MM)
  const [heightMm, setHeightMm] = useState(DEFAULT_LABEL_HEIGHT_MM)
  const [fileName, setFileName] = useState("")
  const [pasted, setPasted] = useState("")
  const [batchName, setBatchName] = useState("")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewCount, setPreviewCount] = useState(PREVIEW_STEP)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")

  // Serial → the exact canvas shown on screen, reused verbatim for the print
  // file so the download can never disagree with the preview.
  const canvases = useRef(new Map<string, HTMLCanvasElement>())
  const onCanvas = useCallback((serial: string, canvas: HTMLCanvasElement) => {
    canvases.current.set(serial, canvas)
  }, [])

  const printable = useMemo(() => rows.filter((r) => r.issues.length === 0), [rows])
  const blocked = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows])
  const chosen = useMemo(
    () => printable.filter((r) => selected.has(r.serialKey)),
    [printable, selected]
  )

  /** Shared by the file picker and the paste box so the two cannot drift. */
  async function ingest(csvText: string, sourceName: string) {
    setError("")
    setStatus("")
    setBusy(true)

    let result: Awaited<ReturnType<typeof validateLabelUpload>>
    try {
      result = await validateLabelUpload(csvText)
    } catch (e) {
      // A thrown action must not leave the operator staring at an unchanged
      // screen wondering whether the upload worked.
      setBusy(false)
      setError(e instanceof Error ? e.message : "فشل قراءة الملف")
      return
    }
    setBusy(false)

    if ("error" in result) {
      setError(translateActionError(result.error))
      return
    }

    setFileName(sourceName)
    setBatchName((n) => n || sourceName.replace(/\.[^.]+$/, ""))
    setRows(result.rows)
    // Everything valid starts selected — the operator deselects, which is
    // safer than a silent empty selection that prints nothing.
    setSelected(new Set(result.rows.filter((r) => r.issues.length === 0).map((r) => r.serialKey)))
    setPreviewCount(PREVIEW_STEP)
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const profile = getProfile(profileId)
  const size = useMemo(() => ({ widthMm, heightMm }), [widthMm, heightMm])
  const dots = labelDots(profile, size)
  const sizeProblems = checkLabelSize(profile, size)

  function urlFor(row: ParsedRow) {
    return baseUrl + row.serialKey
  }

  /**
   * Prints through the operating system's own print dialog.
   *
   * This is the printer-agnostic path: each label is placed at exact
   * millimetres on its own 50×25 mm page, so any printer with a driver on the
   * machine can produce it — no knowledge of the printer's command language
   * required. Slightly lower fidelity than sending the bitmap directly, but it
   * works on hardware nobody has calibrated yet.
   */
  async function printViaBrowser() {
    setError("")
    if (chosen.length === 0) {
      setError("لم تختر أي ملصق")
      return
    }
    setBusy(true)
    setStatus("جارٍ تحضير الطباعة…")

    const { drawLabel, loadLogo } = await import("@/lib/labels/render")
    const logo = await loadLogo()

    const images = chosen.map((row) => {
      const canvas = document.createElement("canvas")
      drawLabel(canvas, { serialNumber: row.serialNumber, url: urlFor(row) }, logo, profileId, size)
      return canvas.toDataURL("image/png")
    })

    const win = window.open("", "_blank", "width=520,height=420")
    if (!win) {
      setBusy(false)
      setError("المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع")
      return
    }

    const w = widthMm
    const h = heightMm
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>labels</title><style>
        @page { size: ${w}mm ${h}mm; margin: 0 }
        html,body { margin:0; padding:0; background:#fff }
        img { display:block; width:${w}mm; height:${h}mm; page-break-after:always;
              image-rendering: pixelated }
        img:last-child { page-break-after:auto }
      </style></head><body>` +
        images.map((src) => `<img src="${src}">`).join("") +
        `</body></html>`
    )
    win.document.close()

    // Wait for the images to decode before opening the dialog, or the first
    // page prints blank.
    const imgs = Array.from(win.document.images)
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.onload = r
              img.onerror = r
            })
      )
    )
    win.focus()
    win.print()

    setBusy(false)
    setStatus(`تم تحضير ${chosen.length} ملصق للطباعة`)
  }

  /**
   * Builds the .zpl from the on-screen canvases. A label whose canvas has not
   * rendered yet is drawn off-screen first — never silently skipped, which
   * would hand back a file quietly missing devices.
   */
  async function downloadZpl() {
    setError("")
    if (chosen.length === 0) {
      setError("لم تختر أي ملصق")
      return
    }
    setBusy(true)
    setStatus("جارٍ توليد ملف الطباعة…")

    const { drawLabel, loadLogo } = await import("@/lib/labels/render")
    const logo = await loadLogo()
    const parts: string[] = []

    for (const row of chosen) {
      let canvas = canvases.current.get(row.serialNumber)
      // Re-render when the on-screen canvas was drawn for a different printer,
      // so the downloaded file can never carry the previous profile's grid.
      if (!canvas || canvas.width !== dots.width || canvas.height !== dots.height) {
        canvas = document.createElement("canvas")
        drawLabel(
          canvas,
          { serialNumber: row.serialNumber, url: urlFor(row) },
          logo,
          profileId,
          size
        )
      }
      parts.push(labelZpl(canvasToMono(canvas), canvas.width, canvas.height, profileId, size))
    }

    const blob = new Blob([parts.join("")], { type: "application/octet-stream" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${(batchName || "labels").replace(/[^\w-]+/g, "_")}.zpl`
    a.click()
    URL.revokeObjectURL(a.href)

    setBusy(false)
    setStatus(`تم توليد ${chosen.length} ملصق`)
  }

  async function register() {
    setError("")
    if (chosen.length === 0) {
      setError("لم تختر أي ملصق")
      return
    }
    setBusy(true)
    const result = await registerLabelBatch({
      name: batchName || fileName || "دفعة",
      sourceFile: fileName || undefined,
      devices: chosen.map((r) => ({
        serialNumber: r.serialNumber,
        brand: r.brand || undefined,
        model: r.model || undefined,
        deviceType: r.deviceType || undefined,
      })),
    })
    setBusy(false)

    if ("error" in result && result.error) {
      setError(translateActionError(result.error))
      return
    }
    setStatus(`تم تسجيل ${result.registered ?? 0} جهاز في النظام`)
    router.refresh()
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="file">ملف السيريالات (CSV)</Label>
          <input
            id="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void f.text().then((text) => ingest(text, f.name))
            }}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            الأعمدة المقبولة: Serial (إلزامي) · Brand · Model · Type — بالعربي أو الإنجليزي
          </p>
        </div>

        {rows.length > 0 && (
          <div className="grid gap-1.5 sm:max-w-sm">
            <Label htmlFor="batch">اسم الدفعة</Label>
            <Input id="batch" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="paste">أو الصق الصفوف مباشرة (من Excel أو أي جدول)</Label>
          <Textarea
            id="paste"
            rows={4}
            dir="ltr"
            placeholder={"Serial,Brand,Model,Type\nHK56KK4N66,Apple,iPad Pro 128GB,Tablet"}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !pasted.trim()}
              onClick={() => void ingest(normalisePasted(pasted), "لصق مباشر")}
            >
              افحص الصفوف الملصوقة
            </Button>
          </div>
        </div>

        <div className="grid gap-1.5 sm:max-w-md">
          <Label htmlFor="printer">الطابعة</Label>
          <select
            id="printer"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {PRINTER_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.calibrated ? "" : " — غير معايرة"}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{profile.notes}</p>
        </div>

        <div className="grid gap-1.5">
          <Label>مقاس الملصق الفعلي (مم)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              min={MIN_LABEL_WIDTH_MM}
              max={profile.maxPrintableWidthMm}
              value={widthMm}
              onChange={(e) => setWidthMm(Number(e.target.value) || 0)}
              className="w-24"
              aria-label="العرض بالمليمتر"
            />
            <span className="text-muted-foreground">×</span>
            <Input
              type="number"
              step="0.1"
              min={MIN_LABEL_HEIGHT_MM}
              value={heightMm}
              onChange={(e) => setHeightMm(Number(e.target.value) || 0)}
              className="w-24"
              aria-label="الطول بالمليمتر"
            />
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              = {dots.width}×{dots.height} dots @ {profile.dotsPerMm}/mm
            </span>
          </div>
          {sizeProblems.length > 0 && (
            <ul className="text-xs text-destructive">
              {sizeProblems.map((p) => (
                <li key={p}>{SIZE_PROBLEM_TEXT[p](profile.maxPrintableWidthMm)}</li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          اللينك المطبوع: <span dir="ltr" className="font-mono">{baseUrl}&lt;serial&gt;</span>
        </p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {status && <p className="text-sm text-emerald-700 dark:text-emerald-300">{status}</p>}

      {rows.length > 0 && (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <Badge variant="default">صالح: {printable.length}</Badge>
            {blocked.length > 0 && <Badge variant="destructive">مرفوض: {blocked.length}</Badge>}
            <Badge variant="secondary">مختار: {chosen.length}</Badge>
            <div className="ms-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set(printable.map((r) => r.serialKey)))}
              >
                اختر الكل
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                إلغاء الاختيار
              </Button>
            </div>
          </section>

          {blocked.length > 0 && (
            <section className="rounded-xl border border-destructive/40 bg-card">
              <header className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold text-destructive">
                  صفوف لن تُطبع ({blocked.length})
                </h2>
              </header>
              <ul className="divide-y text-sm">
                {blocked.slice(0, 30).map((r) => (
                  <li key={`${r.rowNumber}-${r.serialNumber}`} className="flex flex-wrap gap-2 px-4 py-2">
                    <span className="text-muted-foreground">سطر {r.rowNumber}</span>
                    <span className="font-mono" dir="ltr">
                      {r.serialNumber || "—"}
                    </span>
                    {r.issues.map((i) => (
                      <Badge key={i} variant="destructive">
                        {ISSUE_TEXT[i]}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ZoomControl state={zoomState} />

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                معاينة ({Math.min(previewCount, printable.length)} من {printable.length})
              </h2>
              {previewCount < printable.length && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewCount((n) => n + PREVIEW_STEP)}
                  >
                    عرض {PREVIEW_STEP} إضافية
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPreviewCount(printable.length)}>
                    عرض الكل ({printable.length})
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              {printable.slice(0, previewCount).map((row) => (
                <label
                  key={row.serialKey}
                  className={`grid cursor-pointer gap-1.5 rounded-lg border p-2 ${
                    selected.has(row.serialKey) ? "border-primary bg-primary/5" : "border-dashed"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.has(row.serialKey)}
                      onChange={() => toggle(row.serialKey)}
                    />
                    <span className="font-mono" dir="ltr">
                      {row.serialNumber}
                    </span>
                  </div>
                  <LabelPreview
                    data={{ serialNumber: row.serialNumber, url: urlFor(row) }}
                    zoom={zoomState.effectiveZoom}
                    profileId={profileId}
                    size={size}
                    onCanvas={onCanvas}
                  />
                  {row.model && (
                    <p className="max-w-[400px] truncate text-xs text-muted-foreground">
                      {row.model}
                    </p>
                  )}
                </label>
              ))}
            </div>
          </section>

          <section className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
            {profile.language === "zpl" && (
              <Button
                onClick={downloadZpl}
                disabled={busy || chosen.length === 0 || sizeProblems.length > 0}
              >
                نزّل ملف الطباعة ({chosen.length})
              </Button>
            )}
            <Button
              variant={profile.language === "pdf" ? "default" : "secondary"}
              onClick={printViaBrowser}
              disabled={busy || chosen.length === 0 || sizeProblems.length > 0}
            >
              اطبع من المتصفح ({chosen.length})
            </Button>
            <Button variant="outline" onClick={register} disabled={busy || chosen.length === 0}>
              سجّل الدفعة في النظام
            </Button>
          </section>

          {profile.language === "zpl" && (
          <p className="text-xs text-muted-foreground">
            بعد التنزيل، أرسل الملف للطابعة:{" "}
            <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5">
              lpr -P &lt;PRINTER&gt; -o raw FILE.zpl
            </code>
          </p>
          )}
        </>
      )}
    </div>
  )
}
