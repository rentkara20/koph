"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Eraser, PenLine } from "lucide-react"

export interface SignatureCanvasHandle {
  isEmpty(): boolean
  toDataURL(): string
  clear(): void
}

/**
 * Large, clearly bordered signature pad. Works with mouse, pen and touch via
 * pointer events. Exposes an imperative handle so the form can read/clear it.
 */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, { invalid?: boolean }>(
  function SignatureCanvas({ invalid }, ref) {
    const t = useTranslations("signatures.signing")
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const isDrawingRef = useRef(false)
    const isEmptyRef = useRef(true)
    const [isEmpty, setIsEmpty] = useState(true)

    useImperativeHandle(ref, () => ({
      isEmpty: () => isEmptyRef.current,
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      clear: handleClear,
    }))

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.strokeStyle = "#1e2730"
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
        <canvas
          ref={canvasRef}
          width={640}
          height={220}
          className={`h-44 w-full rounded-xl border-2 border-dashed bg-card transition-colors ${
            invalid ? "border-destructive" : "border-border"
          }`}
          style={{ touchAction: "none", cursor: "crosshair" }}
          aria-label={t("draw")}
        />
      </div>
    )
  }
)
