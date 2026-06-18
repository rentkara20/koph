"use client"

import { useRef, useState } from "react"
import { CheckCircle, XCircle } from "lucide-react"
import { submitSignature, rejectSignature } from "@/lib/actions/signatures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { SignatureCanvas, type SignatureCanvasHandle } from "./signature-canvas"

type Props = {
  token: string
  requireNationalId: boolean
  documentName: string
  consentText: string
}

export function SignatureForm({ token, requireNationalId, documentName, consentText }: Props) {
  const canvasRef = useRef<SignatureCanvasHandle>(null)
  const [step, setStep] = useState<"form" | "success" | "declined">("form")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [consentAccepted, setConsentAccepted] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")

    if (!consentAccepted) {
      setError("You must accept the consent to proceed.")
      return
    }
    if (canvasRef.current?.isEmpty()) {
      setError("Please draw your signature.")
      return
    }

    const fd = new FormData(e.currentTarget)
    const signatureData = canvasRef.current!.toDataURL()

    setLoading(true)
    const result = await submitSignature(token, {
      fullName: fd.get("fullName") as string,
      mobile: fd.get("mobile") as string,
      nationalId: (fd.get("nationalId") as string) || undefined,
      signatureData,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setStep("success")
  }

  async function handleDecline() {
    setLoading(true)
    await rejectSignature(token)
    setStep("declined")
  }

  if (step === "success") {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 px-6 py-10 text-center space-y-3">
        <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
        <p className="font-semibold text-green-900">Document signed successfully</p>
        <p className="text-sm text-green-700">
          Your signature has been recorded for <strong>{documentName}</strong>.
        </p>
      </div>
    )
  }

  if (step === "declined") {
    return (
      <div className="rounded-xl bg-muted border px-6 py-10 text-center space-y-3">
        <XCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="font-semibold">Signature declined</p>
        <p className="text-sm text-muted-foreground">
          You have declined to sign this document. Contact the operations team if this was a
          mistake.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-background border p-4 space-y-4">
      <p className="font-semibold text-sm">Your information</p>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-sm">
            Full name <span className="text-destructive">*</span>
          </Label>
          <Input id="fullName" name="fullName" required placeholder="Enter your full name" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mobile" className="text-sm">
            Mobile number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mobile"
            name="mobile"
            required
            type="tel"
            placeholder="+966 5X XXX XXXX"
            inputMode="tel"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nationalId" className="text-sm">
            National ID / Iqama
            {requireNationalId ? (
              <span className="text-destructive"> *</span>
            ) : (
              <span className="text-muted-foreground text-xs"> (optional)</span>
            )}
          </Label>
          <Input
            id="nationalId"
            name="nationalId"
            required={requireNationalId}
            placeholder="ID number"
            inputMode="numeric"
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label className="text-sm">
          Signature <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">Draw your signature in the box below</p>
        <SignatureCanvas ref={canvasRef} />
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">{consentText}</p>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
          />
          <span className="text-sm leading-snug">
            I accept the above terms and consent to sign electronically
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" disabled={loading || !consentAccepted} className="w-full">
          {loading ? "Submitting…" : "Submit signature"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={handleDecline}
          className="text-muted-foreground hover:text-destructive"
        >
          Decline to sign
        </Button>
      </div>
    </form>
  )
}
