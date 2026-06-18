"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronLeft, RotateCcw } from "lucide-react"
import { signOnSiteByTaskToken } from "@/lib/actions/signatures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Step = "form" | "pad" | "done"

type Props = {
  taskToken: string
  customerName: string | null
  customerMobile: string | null
}

export function OnSiteSigningFlow({ taskToken, customerName, customerMobile }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("form")
  const [fullName, setFullName] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  function handleStart() {
    setFullName(customerName ?? "")
    setNationalId("")
    setSignatureData(null)
    setError("")
    setStep("form")
    setOpen(true)
  }

  function handleFormNext() {
    if (!fullName.trim()) { setError("Full name is required"); return }
    if (!nationalId.trim()) { setError("National / Iqama ID is required"); return }
    setError("")
    setStep("pad")
  }

  async function handleConfirm(data: string) {
    setSignatureData(data)
    setSaving(true)
    setError("")
    const result = await signOnSiteByTaskToken(taskToken, {
      fullName: fullName.trim(),
      nationalId: nationalId.trim(),
      signatureData: data,
    })
    setSaving(false)
    if (result.error) { setError(result.error); setStep("pad"); return }
    setStep("done")
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={handleStart}
        className="w-full rounded-xl border-2 border-dashed border-muted-foreground/30 px-4 py-5 text-center hover:border-primary/40 hover:bg-muted/30 transition-colors"
      >
        <p className="text-sm font-medium">Start customer signing</p>
        <p className="text-xs text-muted-foreground mt-0.5">Collect signature on this device</p>
      </button>
    )
  }

  return (
    <div className="rounded-xl bg-background border overflow-hidden">
      {/* Step: Info form */}
      {step === "form" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
            <p className="font-medium text-sm">Customer details</p>
          </div>
          <p className="text-xs text-muted-foreground">Ask the customer to confirm their details. You can edit if needed.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full name <span className="text-destructive">*</span></Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Customer full name"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">National / Iqama ID <span className="text-destructive">*</span></Label>
              <Input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="ID number"
                inputMode="numeric"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleFormNext}>
            Open signature pad →
          </Button>
        </div>
      )}

      {/* Step: Signature pad (full-screen overlay) */}
      {step === "pad" && (
        <SignaturePad
          saving={saving}
          error={error}
          onBack={() => setStep("form")}
          onConfirm={handleConfirm}
        />
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="p-6 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-10 text-green-600" />
          <p className="font-semibold">Signed successfully</p>
          <p className="text-sm text-muted-foreground">
            The delivery document has been signed by <strong>{fullName}</strong>.
          </p>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Full-screen canvas signature pad ────────────────────────────────────────

function SignaturePad({
  saving,
  error,
  onBack,
  onConfirm,
}: {
  saving: boolean
  error: string
  onBack: () => void
  onConfirm: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)

  // Size canvas to fill the viewport
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const ctx = canvas.getContext("2d")!
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight - 120 // reserve space for bottom bar
      ctx.putImageData(img, 0, 0)
      ctx.strokeStyle = "#111"
      ctx.lineWidth = 2.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext("2d")!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext("2d")!
    ctx.strokeStyle = "#111"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasStrokes(true)
  }, [])

  const endDraw = useCallback(() => { drawing.current = false }, [])

  function clearPad() {
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  function confirm() {
    if (!hasStrokes) return
    const dataUrl = canvasRef.current!.toDataURL("image/png")
    onConfirm(dataUrl)
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <p className="text-sm font-medium">Sign here</p>
        <button
          onClick={clearPad}
          disabled={saving}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          Clear
        </button>
      </div>

      {/* Signature hint */}
      {!hasStrokes && (
        <div className="absolute inset-0 top-[53px] bottom-[72px] flex items-center justify-center pointer-events-none">
          <p className="text-muted-foreground/40 text-lg select-none">Sign here</p>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 touch-none cursor-crosshair"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />

      {/* Bottom bar */}
      <div className="px-4 py-4 border-t bg-white space-y-2">
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <Button
          className="w-full"
          disabled={!hasStrokes || saving}
          onClick={confirm}
        >
          {saving ? "Saving…" : "Confirm signature"}
        </Button>
      </div>
    </div>
  )
}
