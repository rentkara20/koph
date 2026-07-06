"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, ChevronRight, PenLine, X } from "lucide-react"
import { signOnSiteByTaskToken } from "@/lib/actions/signatures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

type Step = "form" | "pad" | "done"

type Props = {
  taskToken: string
  customerName: string | null
  customerMobile: string | null
}

export function OnSiteSigningFlow({ taskToken, customerName }: Props) {
  const t = useTranslations("signatures.signing")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("form")
  const [fullName, setFullName] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  function handleStart() {
    setFullName(customerName ?? "")
    setNationalId("")
    setError("")
    setStep("form")
    setOpen(true)
  }

  function handleFormNext() {
    if (!fullName.trim()) { setError(t("fullName")); return }
    if (!nationalId.trim()) { setError(t("nationalId")); return }
    setError("")
    setStep("pad")
  }

  async function handleConfirm(data: string) {
    setSaving(true)
    setError("")
    const result = await signOnSiteByTaskToken(taskToken, {
      fullName: fullName.trim(),
      nationalId: nationalId.trim(),
      signatureData: data,
    })
    setSaving(false)
    if (result.error) { setError(translateActionError(result.error)); setStep("pad"); return }
    setStep("done")
    router.refresh()
  }

  // Trigger — prominent purple call-to-action (collection-app style)
  if (!open) {
    return (
      <button
        onClick={handleStart}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-kara-purple px-4 py-3.5 text-base font-semibold text-white shadow-[0_2px_8px_rgba(81,43,131,0.25)] transition-colors hover:bg-kara-purple-hover active:opacity-90"
      >
        <PenLine className="size-5" />
        {t("tapToSign")}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Step: customer details */}
      {step === "form" && (
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <p className="text-sm font-semibold text-kara-purple">{t("customerDetails")}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t("detailsHint")}</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("fullName")} <span className="text-destructive">*</span></Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("nationalId")} <span className="text-destructive">*</span></Label>
              <Input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder={t("idPlaceholder")}
                inputMode="numeric"
                className="font-mono"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            className="h-12 w-full bg-kara-purple text-base font-semibold hover:bg-kara-purple-hover"
            onClick={handleFormNext}
          >
            {t("openPad")}
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      )}

      {/* Step: full-screen signature pad */}
      {step === "pad" && (
        <SignaturePad
          saving={saving}
          error={error}
          onCancel={() => setStep("form")}
          onConfirm={handleConfirm}
        />
      )}

      {/* Step: done */}
      {step === "done" && (
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="font-semibold">{t("signedSuccess")}</p>
          <p className="text-sm text-muted-foreground">{t("signedByName", { name: fullName })}</p>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("close")}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Full-screen canvas signature pad (pointer events, mobile-first) ─────────

function SignaturePad({
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  saving: boolean
  error: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}) {
  const t = useTranslations("signatures.signing")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  const applyStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#1E2630"
    ctx.lineWidth = 3
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [])

  // Size the canvas to its rendered box.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      const ctx = canvas.getContext("2d")
      if (ctx) applyStyle(ctx)
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [applyStyle])

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvas.getContext("2d")!
    applyStyle(ctx)
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }, [applyStyle])

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasStrokes(true)
  }, [])

  const onUp = useCallback(() => { drawing.current = false }, [])

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  // Crop to the drawn strokes' bounding box so the stored signature isn't a
  // huge mostly-empty image.
  function confirm() {
    if (!hasStrokes) return
    const src = canvasRef.current!
    const ctx = src.getContext("2d")!
    const data = ctx.getImageData(0, 0, src.width, src.height).data
    let x1 = src.width, y1 = src.height, x2 = 0, y2 = 0, found = false
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (data[(y * src.width + x) * 4 + 3] > 20) {
          found = true
          if (x < x1) x1 = x
          if (y < y1) y1 = y
          if (x > x2) x2 = x
          if (y > y2) y2 = y
        }
      }
    }
    const pad = 24
    const cx = found ? Math.max(0, x1 - pad) : 0
    const cy = found ? Math.max(0, y1 - pad) : 0
    const cw = found ? Math.min(src.width, x2 + pad) - cx : src.width
    const ch = found ? Math.min(src.height, y2 + pad) - cy : src.height
    const out = document.createElement("canvas")
    out.width = cw
    out.height = ch
    out.getContext("2d")!.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch)
    onConfirm(out.toDataURL("image/png"))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Purple header */}
      <div className="flex shrink-0 items-center justify-between bg-kara-purple px-4 py-3.5 text-white">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg bg-white/15 px-3.5 py-1.5 text-sm font-semibold"
        >
          {t("cancel")}
        </button>
        <p className="text-sm font-bold">{t("title")}</p>
        <button
          onClick={clear}
          disabled={saving}
          className="rounded-lg bg-white/15 px-3.5 py-1.5 text-sm font-semibold"
        >
          {t("clear")}
        </button>
      </div>

      {/* Hint */}
      <p className="shrink-0 border-b border-dashed border-border py-2 text-center text-xs text-muted-foreground">
        {t("padHint")}
      </p>

      {/* Canvas */}
      <div className="relative flex-1">
        {!hasStrokes && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <PenLine className="size-8 text-muted-foreground/25" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
        />
      </div>

      {/* Confirm */}
      <div
        className="shrink-0 space-y-2 border-t border-border p-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {error && <p className="text-center text-xs text-destructive">{error}</p>}
        <button
          onClick={confirm}
          disabled={!hasStrokes || saving}
          className="w-full rounded-xl bg-kara-purple py-4 text-[17px] font-bold text-white transition-opacity disabled:opacity-40"
        >
          {saving ? "…" : `✓ ${t("confirmSign")}`}
        </button>
      </div>
    </div>
  )
}
