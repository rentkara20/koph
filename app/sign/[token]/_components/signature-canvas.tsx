"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"

export interface SignatureCanvasHandle {
  isEmpty(): boolean
  toDataURL(): string
  clear(): void
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle>(
  function SignatureCanvas(_, ref) {
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

      ctx.strokeStyle = "#0f172a"
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
      <div className="space-y-1.5">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full rounded-lg border-2 border-dashed cursor-crosshair bg-white"
          style={{ height: "180px", touchAction: "none" }}
        />
        {!isEmpty && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear signature
          </button>
        )}
      </div>
    )
  }
)
