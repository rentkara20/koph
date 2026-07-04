"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { CircleAlert, Loader2 } from "lucide-react"
import { submitSignature } from "@/lib/actions/signatures"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { SignatureCanvas, type SignatureCanvasHandle } from "./signature-canvas"

type Props = {
  token: string
  requireNationalId: boolean
  documentName: string
  consentText: string
}

type FieldKey = "fullName" | "nationalId" | "signature"

export function SignatureForm({ token, requireNationalId, consentText }: Props) {
  const t = useTranslations("signatures.signing")
  const tc = useTranslations("common")
  const canvasRef = useRef<SignatureCanvasHandle>(null)

  const [fullName, setFullName] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [mobile, setMobile] = useState("")
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [invalid, setInvalid] = useState<Set<FieldKey>>(new Set())

  function markInvalid(fields: FieldKey[]) {
    setInvalid(new Set(fields))
  }

  function clearField(field: FieldKey) {
    setInvalid((prev) => {
      if (!prev.has(field)) return prev
      const next = new Set(prev)
      next.delete(field)
      return next
    })
  }

  async function handleSubmit() {
    const failed: FieldKey[] = []
    if (fullName.trim().length < 2) failed.push("fullName")
    if (requireNationalId && nationalId.trim().length < 5) failed.push("nationalId")
    if (canvasRef.current?.isEmpty() !== false) failed.push("signature")

    if (failed.length > 0 || !consentAccepted) {
      markInvalid(failed)
      toast.error(t("draw"))
      return
    }

    setLoading(true)
    const result = await submitSignature(token, {
      fullName: fullName.trim(),
      mobile: mobile.trim() || undefined,
      nationalId: nationalId.trim() || undefined,
      signatureData: canvasRef.current?.toDataURL() ?? "",
    })
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(t("signed"))
    // Reload to show signed state with delivery note + download button
    window.location.reload()
  }

  const canSubmit = consentAccepted && !loading

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="bg-kara-purple px-5 py-3.5">
        <h2 className="text-sm font-semibold text-primary-foreground">{t("title")}</h2>
      </header>

      <div className="flex flex-col gap-5 p-5">
        {/* Full name */}
        <div className="space-y-1.5">
          <Label htmlFor="sig-name" className="text-sm">
            {t("fullName")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="sig-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value)
              clearField("fullName")
            }}
            autoComplete="name"
            aria-invalid={invalid.has("fullName")}
          />
        </div>

        {/* National ID */}
        <div className="space-y-1.5">
          <Label htmlFor="sig-nid" className="text-sm">
            {requireNationalId ? (
              <>
                {t("nationalId")} <span className="text-destructive">*</span>
              </>
            ) : (
              t("nationalIdOptional")
            )}
          </Label>
          <Input
            id="sig-nid"
            value={nationalId}
            onChange={(e) => {
              setNationalId(e.target.value)
              clearField("nationalId")
            }}
            inputMode="numeric"
            className="font-mono"
            aria-invalid={invalid.has("nationalId")}
          />
        </div>

        {/* Mobile */}
        <div className="space-y-1.5">
          <Label htmlFor="sig-mobile" className="text-sm">
            {t("mobile")}{" "}
            <span className="text-xs text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Input
            id="sig-mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="tel"
            type="tel"
            placeholder="05XXXXXXXX"
          />
        </div>

        {/* Signature pad */}
        <SignatureCanvas
          ref={canvasRef}
          invalid={invalid.has("signature")}
        />

        {/* Consent */}
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{consentText}</p>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 size-4 accent-kara-purple"
            />
            {t("consentAccept")}
          </label>
        </div>

        {!consentAccepted && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleAlert className="size-3.5" aria-hidden />
            {t("consentAccept")}
          </p>
        )}

        <Button
          size="lg"
          className="w-full bg-kara-purple hover:bg-kara-purple/90"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("submit")}
        </Button>
      </div>
    </section>
  )
}
