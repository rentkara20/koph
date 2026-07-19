"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Eraser, Keyboard, PenLine } from "lucide-react"

export interface SignatureCanvasHandle {
  isEmpty(): boolean
  toDataURL(): string
  clear(): void
}

const INK = "#1e2730"

// Uniform breathing room (in source-canvas pixels) added around the trimmed
// ink so the signature never sits jammed against an edge on the delivery note.
const TRIM_PADDING = 24

/**
 * Exports the drawn signature cropped to its ink bounding box with even padding
 * on all sides. This keeps every stored signature tight and centered regardless
 * of where on the pad the user signed — no large empty margins, no stroke
 * jammed against an edge. Returns "" when the canvas has no ink.
 */
function exportTrimmed(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return "" // no ink

  const inkW = maxX - minX + 1
  const inkH = maxY - minY + 1

  // Output is the ink plus even padding on every side, with the ink copied into
  // the centre. Padding is guaranteed symmetric regardless of where on the pad
  // the user signed — even if the strokes ran right up to an edge.
  const out = document.createElement("canvas")
  out.width = inkW + TRIM_PADDING * 2
  out.height = inkH + TRIM_PADDING * 2
  out
    .getContext("2d")
    ?.drawImage(canvas, minX, minY, inkW, inkH, TRIM_PADDING, TRIM_PADDING, inkW, inkH)
  return out.toDataURL("image/png")
}

/**
 * Large, clearly bordered signature pad. Works with mouse, pen and touch via
 * pointer events, plus a keyboard-accessible typed-name fallback for users
 * who cannot draw (WCAG 2.1.1). Exposes an imperative handle so the form can
 * read/clear it.
 */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, { invalid?: boolean }>(
  function SignatureCanvas({ invalid }, ref) {
    const t = useTranslations("signatures.signing")
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const isDrawingRef = useRef(false)
    const isEmptyRef = useRef(true)
    const [isEmpty, setIsEmpty] = useState(true)
    const [typedMode, setTypedMode] = useState(false)
    const [typedName, setTypedName] = useState("")

    useImperativeHandle(ref, () => ({
      isEmpty: () => isEmptyRef.current,
      toDataURL: () => (canvasRef.current ? exportTrimmed(canvasRef.current) : ""),
      clear: handleClear,
    }))

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.strokeStyle = INK
      ctx.lineWidth = 2.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      function getXY(e: PointerEvent) {
        const rect = canvas!.getBoundingClientRect()
        return {
          x: (e.clientX - rect.left) * (canvas!.width / rect.width),
          y: (e.clientY - rect.top) * (canvas!.height / rect.height),
        }
      }

      function onDown(e: PointerEvent) {
        e.preventDefault()
        isDrawingRef.current = true
        canvas!.setPointerCapture(e.pointerId)
        const { x, y } = getXY(e)
        ctx!.beginPath()
        ctx!.moveTo(x, y)
      }

      function onMove(e: PointerEvent) {
        if (!isDrawingRef.current) return
        e.preventDefault()
        const { x, y } = getXY(e)
        ctx!.lineTo(x, y)
        ctx!.stroke()
        if (isEmptyRef.current) {
          isEmptyRef.current = false
          setIsEmpty(false)
        }
      }

      function onUp() {
        isDrawingRef.current = false
      }

      canvas.addEventListener("pointerdown", onDown)
      canvas.addEventListener("pointermove", onMove)
      canvas.addEventListener("pointerup", onUp)
      canvas.addEventListener("pointercancel", onUp)

      return () => {
        canvas.removeEventListener("pointerdown", onDown)
        canvas.removeEventListener("pointermove", onMove)
        canvas.removeEventListener("pointerup", onUp)
        canvas.removeEventListener("pointercancel", onUp)
      }
    }, [])

    function handleClear() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      isEmptyRef.current = true
      setIsEmpty(true)
      setTypedName("")
    }

    // Typed-name fallback: render the name onto the same canvas so the stored
    // signature format stays identical to a drawn one.
    function handleTyped(name: string) {
      setTypedName(name)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const trimmed = name.trim()
      if (!trimmed) {
        isEmptyRef.current = true
        setIsEmpty(true)
        return
      }
      ctx.save()
      ctx.fillStyle = INK
      ctx.font = "italic 52px 'Segoe Script', 'Comic Sans MS', cursive"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2, canvas.width - 40)
      ctx.restore()
      isEmptyRef.current = false
      setIsEmpty(false)
    }

    function toggleMode() {
      handleClear()
      setTypedMode((m) => !m)
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <PenLine className="size-4 text-muted-foreground" aria-hidden />
            {t("draw")}
          </span>
          {!isEmpty && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
            >
              <Eraser className="size-3.5" aria-hidden />
              {t("clear")}
            </button>
          )}
        </div>

        {typedMode && (
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTyped(e.target.value)}
            aria-label={t("typedSignLabel")}
            placeholder={t("typedSignLabel")}
            autoComplete="name"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        <canvas
          ref={canvasRef}
          width={640}
          height={220}
          role="img"
          className={`h-44 w-full rounded-xl border-2 border-dashed bg-card transition-colors ${
            invalid ? "border-destructive" : "border-border"
          } ${typedMode ? "pointer-events-none" : ""}`}
          style={{ touchAction: "none", cursor: typedMode ? "default" : "crosshair" }}
          aria-label={t("draw")}
        />

        <button
          type="button"
          onClick={toggleMode}
          aria-pressed={typedMode}
          className="flex items-center gap-1.5 text-xs font-medium text-kara-purple underline-offset-2 hover:underline"
        >
          <Keyboard className="size-3.5" aria-hidden />
          {typedMode ? t("draw") : t("typedSignToggle")}
        </button>
      </div>
    )
  }
)
