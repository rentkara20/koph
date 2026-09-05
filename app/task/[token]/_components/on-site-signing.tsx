"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, ChevronRight, PenLine, X } from "lucide-react"
import { signOnSiteByTaskToken, signOnSiteForRequestGroup } from "@/lib/actions/signatures"
import { captureSigningGeo } from "@/lib/utils/signing-geo"
import { canSubmitSignature } from "@/lib/domain/signing-review"
import { digitsOnly, normalizeMobile } from "@/lib/utils/digits"
import { verifyDeliveryOtp } from "@/lib/actions/otp"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateActionError } from "@/lib/i18n/action-errors"

type Step = "otp" | "outcome" | "form" | "pad" | "review" | "done"

type DeliveryOutcome = "full_no_remarks" | "full_with_remarks" | "partial" | "refused"

// Outcomes that make remarks mandatory.
const REMARKS_REQUIRED: DeliveryOutcome[] = ["full_with_remarks", "partial", "refused"]

const OUTCOMES: DeliveryOutcome[] = [
  "full_no_remarks",
  "full_with_remarks",
  "partial",
  "refused",
]

type Props = {
  taskToken: string
  customerName: string | null
  customerMobile: string | null
  // False when a delivery OTP is configured and not yet verified for this task.
  stageUnlocked: boolean
  // Set only for a genuine cross-request batched task (Delivery Batching v2
  // P4) — routes signing to the request-scoped action instead of the legacy
  // whole-task one, so the signature never covers more than this one request.
  requestId?: string
  // Set only for a batched task — lets consecutive groups for the SAME
  // customer reuse name/mobile/national ID on request, without touching the
  // per-request signature_request record (each group still signs and submits
  // independently).
  customerId?: string
  // Shown back to the signer on the review step, so they confirm what they are
  // signing for and not just that they drew something.
  items?: SigningItem[]
}

export type SigningItem = {
  id: string
  description: string
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  quantity: number
}

// sessionStorage-only cache of what THIS signer typed earlier in this trip,
// keyed by task+customer. It is never applied automatically: the signer has to
// press "use the previous signature's details". Autofilling identity fields is
// how a delivery gets signed under someone else's name. Never persisted
// server-side or reused across a different customerId — each
// signature_request/customer_signature row is still written per-group as
// before; this only saves re-typing when the same person asks for it.
type PrefillData = { fullName: string; mobile: string; nationalId: string }

function prefillKey(taskToken: string, customerId: string) {
  return `koph:sig-prefill:${taskToken}:${customerId}`
}

function loadPrefill(taskToken: string, customerId?: string): PrefillData | null {
  if (!customerId || typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(prefillKey(taskToken, customerId))
    return raw ? (JSON.parse(raw) as PrefillData) : null
  } catch {
    return null
  }
}

function savePrefill(taskToken: string, customerId: string | undefined, data: PrefillData) {
  if (!customerId || typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(prefillKey(taskToken, customerId), JSON.stringify(data))
  } catch {
    // Best-effort only — storage full/disabled never blocks signing.
  }
}

export function OnSiteSigningFlow({ taskToken, customerName, customerMobile, stageUnlocked, requestId, customerId, items = [] }: Props) {
  const t = useTranslations("signatures.signing")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("outcome")
  const [otp, setOtp] = useState("")
  const [outcome, setOutcome] = useState<DeliveryOutcome | null>(null)
  const [remarks, setRemarks] = useState("")
  const [position, setPosition] = useState("")
  const [fullName, setFullName] = useState("")
  const [mobile, setMobile] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  // Held between the pad and the final confirmation. Drawing is not consent.
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [previousSigner, setPreviousSigner] = useState<PrefillData | null>(null)
  // Ticked on the review step only, and cleared whenever the signature is
  // redrawn — an acknowledgement covers the signature it was given for.
  const [consentAccepted, setConsentAccepted] = useState(false)

  function handleStart() {
    // Identity fields start EMPTY on purpose. The name, mobile and national ID
    // are the proof that this specific person took delivery, so they are typed
    // by whoever signs — never inherited from the customer record, which is
    // often a company contact rather than the person at the door.
    setFullName("")
    setMobile("")
    setNationalId("")
    setSignatureData(null)
    setConsentAccepted(false)
    setPreviousSigner(loadPrefill(taskToken, customerId))
    setOtp("")
    setOutcome(null)
    setRemarks("")
    setPosition("")
    setError("")
    setStep(stageUnlocked ? "outcome" : "otp")
    setOpen(true)
  }

  async function handleVerifyOtp() {
    if (!/^\d{6}$/.test(digitsOnly(otp))) { setError(t("otpPlaceholder")); return }
    setSaving(true)
    setError("")
    const result = await verifyDeliveryOtp(taskToken, digitsOnly(otp), requestId)
    setSaving(false)
    if (result.error) { setError(translateActionError(result.error)); return }
    setStep("outcome")
  }

  function handleOutcomeNext() {
    if (!outcome) { setError(t("outcomeTitle")); return }
    if (REMARKS_REQUIRED.includes(outcome) && !remarks.trim()) {
      setError(t("remarksRequired")); return
    }
    setError("")
    setStep("form")
  }

  function handleFormNext() {
    if (!fullName.trim()) { setError(t("nameRequired")); return }
    if (!/^\d{10,30}$/.test(digitsOnly(nationalId))) { setError(t("nationalIdRequired")); return }
    setError("")
    setStep("pad")
  }

  // The pad hands the drawing back and stops. Nothing is submitted here.
  function handlePadConfirm(data: string) {
    setSignatureData(data)
    setConsentAccepted(false)
    setError("")
    setStep("review")
  }

  const reviewState = {
    signatureData,
    consentAccepted,
    fullName: fullName.trim(),
    nationalId: digitsOnly(nationalId),
  }

  async function handleFinalSubmit() {
    // Asked again here, not just on the button's disabled state: the gate is
    // the rule, the button is only its presentation.
    if (!canSubmitSignature(reviewState)) {
      if (!signatureData) setStep("pad")
      else setError(t("consentRequired"))
      return
    }
    const data = signatureData!
    setSaving(true)
    setError("")
    // Asked for only at the moment of signing, and never allowed to hold the
    // signature up: on a refusal or a dead GPS this resolves with a reason.
    const geo = await captureSigningGeo()
    const payload = {
      fullName: fullName.trim(),
      nationalId: digitsOnly(nationalId),
      mobile: normalizeMobile(mobile) || undefined,
      position: position.trim() || undefined,
      deliveryOutcome: outcome ?? undefined,
      remarks: remarks.trim() || undefined,
      signatureData: data,
      geo,
    }
    const result = requestId
      ? await signOnSiteForRequestGroup(taskToken, requestId, payload)
      : await signOnSiteByTaskToken(taskToken, payload)
    setSaving(false)
    if (result.error) { setError(translateActionError(result.error)); return }
    savePrefill(taskToken, customerId, {
      fullName: fullName.trim(),
      mobile: normalizeMobile(mobile),
      nationalId: digitsOnly(nationalId),
    })
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
      {/* Step: OTP entry (only when a delivery code is configured + unverified) */}
      {step === "otp" && (
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <p className="text-sm font-semibold text-kara-purple">{t("otpTitle")}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t("otpHint")}</p>
          <Input
            value={otp}
            onChange={(e) => setOtp(digitsOnly(e.target.value).slice(0, 6))}
            placeholder={t("otpPlaceholder")}
            inputMode="numeric"
            pattern="[0-9]*"
            lang="en"
            dir="ltr"
            autoComplete="one-time-code"
            className="text-center font-mono text-2xl tracking-[0.4em]"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            className="h-12 w-full bg-kara-purple text-base font-semibold hover:bg-kara-purple-hover"
            onClick={handleVerifyOtp}
            disabled={saving}
          >
            {saving ? "…" : t("otpVerify")}
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      )}

      {/* Step: delivery outcome */}
      {step === "outcome" && (
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <p className="text-sm font-semibold text-kara-purple">{t("outcomeTitle")}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t("outcomeHint")}</p>
          <div className="space-y-2">
            {OUTCOMES.map((o) => (
              <label
                key={o}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                  outcome === o ? "border-kara-purple bg-kara-purple/5 font-semibold" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="delivery-outcome"
                  className="accent-kara-purple"
                  checked={outcome === o}
                  onChange={() => setOutcome(o)}
                />
                {t(
                  o === "full_no_remarks"
                    ? "outcomeFullNoRemarks"
                    : o === "full_with_remarks"
                      ? "outcomeFullWithRemarks"
                      : o === "partial"
                        ? "outcomePartial"
                        : "outcomeRefused"
                )}
              </label>
            ))}
          </div>
          {outcome && REMARKS_REQUIRED.includes(outcome) && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("remarks")} <span className="text-destructive">*</span></Label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kara-purple/40"
              />
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            className="h-12 w-full bg-kara-purple text-base font-semibold hover:bg-kara-purple-hover"
            onClick={handleOutcomeNext}
          >
            {t("continueBtn")}
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      )}

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

          {/* Reference only — the details on record are shown, never typed into
              the fields for the signer. */}
          {(customerName || customerMobile) && (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">{t("registeredRecipient")}</p>
              <p className="mt-1 text-sm font-medium">{customerName ?? t("notProvided")}</p>
              {customerMobile && (
                <p className="font-mono text-xs text-muted-foreground" dir="ltr">{customerMobile}</p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">{t("registeredHint")}</p>
              <button
                type="button"
                onClick={() => {
                  setFullName(customerName ?? "")
                  setMobile(customerMobile ?? "")
                }}
                className="mt-2 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-kara-purple"
              >
                {t("useRegistered")}
              </button>
            </div>
          )}

          {/* Same trip, same customer, details this signer already typed. Also
              opt-in — pressing it is the signer's own act. */}
          {previousSigner && (
            <button
              type="button"
              onClick={() => {
                setFullName(previousSigner.fullName)
                setMobile(previousSigner.mobile)
                setNationalId(previousSigner.nationalId)
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-kara-purple"
            >
              {t("usePrevious")}
            </button>
          )}

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
              <Label className="text-xs">{t("mobile")} <span className="text-muted-foreground">{t("optional")}</span></Label>
              <Input
                value={mobile}
                onChange={(e) => setMobile(normalizeMobile(e.target.value))}
                placeholder={t("mobilePlaceholder")}
                inputMode="tel"
                pattern="[0-9+]*"
                lang="en"
                dir="ltr"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("position")} <span className="text-muted-foreground">{t("optional")}</span></Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder={t("positionPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("nationalId")} <span className="text-destructive">*</span></Label>
              <Input
                value={nationalId}
                onChange={(e) => setNationalId(digitsOnly(e.target.value).slice(0, 30))}
                placeholder={t("idPlaceholder")}
                inputMode="numeric"
                pattern="[0-9]*"
                lang="en"
                className="font-mono"
                dir="ltr"
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
          saving={false}
          error={error}
          onCancel={() => setStep("form")}
          onConfirm={handlePadConfirm}
        />
      )}

      {/* Step: review — the signer sees exactly what they are confirming, and
          the delivery is only submitted from here. Drawing a signature is not
          by itself an approval. */}
      {step === "review" && (
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep("form")} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <p className="text-sm font-semibold text-kara-purple">{t("reviewTitle")}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t("reviewHint")}</p>

          <dl className="divide-y rounded-lg border border-border">
            <div className="flex items-start justify-between gap-3 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t("fullName")}</dt>
              <dd className="text-sm font-medium text-end">{fullName}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t("mobile")}</dt>
              <dd className="font-mono text-sm text-end" dir="ltr">{mobile || t("notProvided")}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t("nationalId")}</dt>
              <dd className="font-mono text-sm text-end" dir="ltr">{nationalId}</dd>
            </div>
            {position.trim() && (
              <div className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t("position")}</dt>
                <dd className="text-sm text-end">{position}</dd>
              </div>
            )}
            {outcome && (
              <div className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t("reviewOutcome")}</dt>
                <dd className="text-sm text-end">
                  {t(
                    outcome === "full_no_remarks"
                      ? "outcomeFullNoRemarks"
                      : outcome === "full_with_remarks"
                        ? "outcomeFullWithRemarks"
                        : outcome === "partial"
                          ? "outcomePartial"
                          : "outcomeRefused"
                  )}
                </dd>
              </div>
            )}
            {remarks.trim() && (
              <div className="px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t("remarks")}</dt>
                <dd className="mt-1 text-sm whitespace-pre-wrap">{remarks}</dd>
              </div>
            )}
          </dl>

          {items.length > 0 && (
            <div className="rounded-lg border border-border">
              <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                {t("reviewItems")} ({items.length})
              </p>
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      {item.serialNumber && (
                        <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                          S/N: {item.serialNumber}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                      ×{item.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{t("reviewSignature")}</p>
            {signatureData && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={signatureData}
                alt={t("reviewSignature")}
                className="h-24 w-full rounded-lg border border-border bg-white object-contain p-2"
              />
            )}
            <button
              type="button"
              onClick={() => { setConsentAccepted(false); setStep("pad") }}
              disabled={saving}
              className="text-xs font-medium text-kara-purple underline-offset-4 hover:underline"
            >
              {t("redraw")}
            </button>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-kara-purple"
              checked={consentAccepted}
              onChange={(e) => { setConsentAccepted(e.target.checked); setError("") }}
              disabled={saving}
            />
            <span className="text-xs leading-relaxed">{t("reviewConsent")}</span>
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            className="h-14 w-full bg-kara-purple text-base font-semibold hover:bg-kara-purple-hover"
            onClick={handleFinalSubmit}
            disabled={saving || !canSubmitSignature(reviewState)}
          >
            {saving ? "…" : t("finalConfirm")}
          </Button>
          <button
            type="button"
            onClick={() => setStep("form")}
            disabled={saving}
            className="w-full text-center text-xs text-muted-foreground"
          >
            {t("backToDetails")}
          </button>
        </div>
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
          {t("padContinue")}
        </button>
      </div>
    </div>
  )
}
