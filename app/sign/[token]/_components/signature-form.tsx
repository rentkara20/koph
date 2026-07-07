"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, CircleAlert, Loader2 } from "lucide-react"
import { submitSignature } from "@/lib/actions/signatures"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { SignatureCanvas, type SignatureCanvasHandle } from "./signature-canvas"
import { translateActionError } from "@/lib/i18n/action-errors"

type SignItem = {
  id: string
  description: string
  quantity: number
}

type Props = {
  token: string
  requireNationalId: boolean
  documentName: string
  consentText: string
  items: SignItem[]
}

type FieldKey = "fullName" | "nationalId" | "signature"
type Condition = "good" | "damaged" | "missing"

const CONDITIONS: Condition[] = ["good", "damaged", "missing"]

export function SignatureForm({ token, requireNationalId, consentText, items }: Props) {
  const t = useTranslations("signatures.signing")
  const tc = useTranslations("common")
  const router = useRouter()
  const canvasRef = useRef<SignatureCanvasHandle>(null)

  const [fullName, setFullName] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [mobile, setMobile] = useState("")
  const [conditions, setConditions] = useState<Record<string, Condition>>(
    () => Object.fromEntries(items.map((i) => [i.id, "good" as Condition]))
  )
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [invalid, setInvalid] = useState<Set<FieldKey>>(new Set())
  const [attempted, setAttempted] = useState(false)

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
    setAttempted(true)
    const failed: FieldKey[] = []
    if (fullName.trim().length < 2) failed.push("fullName")
    if (requireNationalId && nationalId.trim().length < 5) failed.push("nationalId")
    if (canvasRef.current?.isEmpty() !== false) failed.push("signature")

    if (failed.length > 0) {
      markInvalid(failed)
      toast.error(t("fillRequiredFields"))
      return
    }
    if (!consentAccepted) {
      toast.error(t("consentRequired"))
      return
    }

    setLoading(true)
    const result = await submitSignature(token, {
      fullName: fullName.trim(),
      mobile: mobile.trim() || undefined,
      nationalId: nationalId.trim() || undefined,
      signatureData: canvasRef.current?.toDataURL() ?? "",
      itemConditions: items.map((i) => ({
        requestItemId: i.id,
        condition: conditions[i.id] ?? "good",
      })),
    })
    setLoading(false)

    if (result.error) {
      toast.error(translateActionError(result.error))
      return
    }

    toast.success(t("signed"))
    // Refresh server data in place to show signed state + download button —
    // a full page reload looked like a hang on a slow mobile connection.
    router.refresh()
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
            aria-describedby={invalid.has("fullName") ? "sig-name-error" : undefined}
          />
          {invalid.has("fullName") && (
            <p id="sig-name-error" className="text-xs text-destructive">{t("nameRequired")}</p>
          )}
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
            aria-describedby={invalid.has("nationalId") ? "sig-nid-error" : undefined}
          />
          {invalid.has("nationalId") && (
            <p id="sig-nid-error" className="text-xs text-destructive">{t("nationalIdRequired")}</p>
          )}
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

        {/* Per-item condition */}
        {items.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">{t("itemsCondition")}</Label>
            <ul className="divide-y rounded-lg border border-border">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.description}
                    {item.quantity > 1 && (
                      <span className="text-muted-foreground"> ×{item.quantity}</span>
                    )}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {CONDITIONS.map((c) => {
                      const active = (conditions[item.id] ?? "good") === c
                      const tone =
                        c === "good"
                          ? "data-[on=true]:bg-emerald-600"
                          : c === "damaged"
                            ? "data-[on=true]:bg-amber-600"
                            : "data-[on=true]:bg-destructive"
                      return (
                        <button
                          key={c}
                          type="button"
                          data-on={active}
                          aria-pressed={active}
                          onClick={() =>
                            setConditions((prev) => ({ ...prev, [item.id]: c }))
                          }
                          className={`flex min-h-11 items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium transition-colors data-[on=true]:border-transparent data-[on=true]:font-bold data-[on=true]:text-white ${tone}`}
                        >
                          {active && <Check className="size-3" aria-hidden />}
                          {t(c)}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Signature pad */}
        <SignatureCanvas
          ref={canvasRef}
          invalid={invalid.has("signature")}
        />

        {/* Consent */}
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p id="consent-text" className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {consentText}
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              aria-describedby="consent-text"
              aria-invalid={attempted && !consentAccepted}
              className="mt-0.5 size-4 accent-kara-purple"
            />
            {t("consentAccept")}
          </label>
        </div>

        {attempted && !consentAccepted && (
          <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-destructive">
            <CircleAlert className="size-3.5" aria-hidden />
            {t("consentRequired")}
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
