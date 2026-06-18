"use client"

import { useRef, useState, useEffect } from "react"
import { submitSignature } from "@/lib/actions/signatures"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SignatureCanvasHandle } from "./signature-canvas"

const PURPLE = "#512A83"

/* ── Full-screen canvas overlay ── */
function FullScreenCanvas({
  onConfirm,
  onClose,
}: {
  onConfirm: (dataUrl: string) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const isEmptyRef = useRef(true)
  const [isEmpty, setIsEmpty] = useState(true)

  /* Resize canvas to fill screen */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      const w = window.innerWidth
      const h = window.innerHeight
      // save any existing drawing
      const img = canvas!.toDataURL()
      canvas!.width = w
      canvas!.height = h
      const ctx = canvas!.getContext("2d")
      if (!ctx) return
      ctx.strokeStyle = "#1e2730"
      ctx.lineWidth = 3
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      // restore drawing
      if (!isEmptyRef.current) {
        const image = new Image()
        image.onload = () => ctx.drawImage(image, 0, 0)
        image.src = img
      }
    }

    resize()

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.strokeStyle = "#1e2730"
    ctx.lineWidth = 3
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

  function handleConfirm() {
    if (isEmptyRef.current) return
    const dataUrl = canvasRef.current?.toDataURL("image/png") ?? ""
    onConfirm(dataUrl)
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: PURPLE,
          color: "#fff",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700 }}>وقّع هنا / Sign here</span>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "none",
            color: "#fff",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          إلغاء
        </button>
      </div>

      {/* Hint */}
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "#999",
          padding: "8px 0",
          flexShrink: 0,
        }}
      >
        ارسم توقيعك بإصبعك أو القلم
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          flex: 1,
          display: "block",
          touchAction: "none",
          cursor: "crosshair",
          background: "#fff",
        }}
      />

      {/* Bottom buttons */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "16px 20px",
          flexShrink: 0,
          background: "#f8f8f8",
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <button
          onClick={handleClear}
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: 10,
            border: "1.5px solid #ccc",
            background: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            color: "#666",
          }}
        >
          مسح التوقيع ✕
        </button>
        <button
          onClick={handleConfirm}
          disabled={isEmpty}
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: 10,
            border: "none",
            background: isEmpty ? "#ccc" : PURPLE,
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: isEmpty ? "not-allowed" : "pointer",
          }}
        >
          اعتمد التوقيع ✓
        </button>
      </div>
    </div>
  )
}

/* ── Main SignatureForm ── */
type Step = "review" | "info" | "signed" | "declined"

type Props = {
  token: string
  requireNationalId: boolean
  documentName: string
  consentText: string
}

export function SignatureForm({ token, requireNationalId, consentText }: Props) {
  const [step, setStep] = useState<Step>("review")
  const [fullName, setFullName] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [mobile, setMobile] = useState("")
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Keep unused ref to satisfy existing import in canvas component
  const _unusedRef = useRef<SignatureCanvasHandle>(null)
  void _unusedRef

  async function handleSignatureConfirmed(dataUrl: string) {
    setShowCanvas(false)
    setLoading(true)
    setError("")

    const result = await submitSignature(token, {
      fullName: fullName.trim(),
      mobile: mobile.trim() || undefined,
      nationalId: nationalId.trim() || undefined,
      signatureData: dataUrl,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    // Reload to show signed state with delivery note + download button
    window.location.reload()
  }

  /* ── Step: Review ── */
  if (step === "review") {
    return (
      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #e2e8f0",
          background: "#fff",
        }}
      >
        <div
          style={{
            background: "#f0f9ff",
            borderBottom: "1px solid #bae6fd",
            padding: "14px 18px",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>
            مراجعة الأصناف / Review Items
          </p>
          <p style={{ fontSize: 12, color: "#0369a1" }}>
            قبل التوقيع، تأكد من مراجعة جميع الأصناف المذكورة أعلاه
          </p>
          <p style={{ fontSize: 12, color: "#0369a1", direction: "ltr" }}>
            Before signing, please confirm you have reviewed all items listed above.
          </p>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <button
            onClick={() => setStep("info")}
            style={{
              width: "100%",
              padding: "15px",
              background: PURPLE,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✅ راجعت الأصناف وأوافق على الاستلام
          </button>
        </div>
      </div>
    )
  }

  /* ── Step: Info entry ── */
  if (step === "info") {
    const canProceed = fullName.trim().length >= 2 &&
      (!requireNationalId || nationalId.trim().length >= 5) &&
      consentAccepted

    return (
      <>
        {showCanvas && (
          <FullScreenCanvas
            onConfirm={handleSignatureConfirmed}
            onClose={() => setShowCanvas(false)}
          />
        )}

        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e2e8f0",
            background: "#fff",
          }}
        >
          {/* Section header */}
          <div
            style={{
              background: PURPLE,
              padding: "14px 18px",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              بيانات المستلم / Receiver Details
            </p>
          </div>

          <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Full name */}
            <div>
              <Label htmlFor="sig-name" className="text-sm">
                الاسم الكامل / Full Name{" "}
                <span style={{ color: "#ef4444" }}>*</span>
              </Label>
              <Input
                id="sig-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="أدخل اسمك الكامل"
                className="mt-1.5"
                autoComplete="name"
              />
            </div>

            {/* National ID */}
            <div>
              <Label htmlFor="sig-nid" className="text-sm">
                رقم الهوية / Iqama{" "}
                {requireNationalId ? (
                  <span style={{ color: "#ef4444" }}>*</span>
                ) : (
                  <span style={{ color: "#999", fontSize: 11 }}>(اختياري)</span>
                )}
              </Label>
              <Input
                id="sig-nid"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="رقم الهوية الوطنية أو الإقامة"
                className="mt-1.5 font-mono"
                inputMode="numeric"
              />
            </div>

            {/* Mobile */}
            <div>
              <Label htmlFor="sig-mobile" className="text-sm">
                رقم الجوال / Mobile{" "}
                <span style={{ color: "#999", fontSize: 11 }}>(اختياري)</span>
              </Label>
              <Input
                id="sig-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="05XXXXXXXX"
                className="mt-1.5"
                inputMode="tel"
                type="tel"
              />
            </div>

            {/* Consent */}
            <div
              style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.6, marginBottom: 12 }}>
                {consentText}
              </p>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: PURPLE, cursor: "pointer" }}
                />
                أوافق على الشروط والأحكام / I agree to the terms
              </label>
            </div>

            {error && (
              <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>
            )}

            {/* Sign button */}
            <button
              onClick={() => {
                if (!canProceed) return
                setError("")
                setShowCanvas(true)
              }}
              disabled={!canProceed || loading}
              style={{
                width: "100%",
                padding: "16px",
                background: canProceed && !loading ? PURPLE : "#d1d5db",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 17,
                fontWeight: 700,
                cursor: canProceed && !loading ? "pointer" : "not-allowed",
                marginTop: 4,
              }}
            >
              {loading ? "جارٍ الحفظ…" : "✍️ اضغط هنا لتوقيع العميل"}
            </button>

            <button
              onClick={() => setStep("review")}
              style={{
                background: "none",
                border: "none",
                color: "#999",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                textAlign: "center",
              }}
            >
              ← رجوع
            </button>
          </div>
        </div>
      </>
    )
  }

  return null
}
