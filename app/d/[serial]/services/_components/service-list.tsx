"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { DeviceService } from "@/lib/domain/device-portal"
import { submitDeviceServiceRequest } from "@/lib/actions/device-portal"
import { translateActionError } from "@/lib/i18n/action-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Renders the admin-configured catalogue. A service flagged editsDeviceData
 * additionally collects proposed brand/model/type values — those are filed as
 * a proposal for admin review, never written straight to inventory.
 */
export function ServiceList({
  serial,
  services,
}: {
  serial: string
  services: DeviceService[]
}) {
  const t = useTranslations("devicePortal.services")
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [deviceType, setDeviceType] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  function label(s: DeviceService) {
    return locale === "en" ? s.labelEn || s.labelAr : s.labelAr || s.labelEn
  }

  function reset() {
    setNote("")
    setBrand("")
    setModel("")
    setDeviceType("")
    setError("")
  }

  async function submit(service: DeviceService) {
    setError("")
    setLoading(true)
    const result = await submitDeviceServiceRequest(serial, {
      kind: service.key,
      note: note || undefined,
      brand: brand || undefined,
      model: model || undefined,
      deviceType: deviceType || undefined,
    })
    setLoading(false)
    if (result?.error) {
      setError(translateActionError(result.error))
      return
    }
    setOpen(null)
    reset()
    setDone(true)
    router.refresh()
  }

  if (services.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {t("none")}
      </p>
    )
  }

  return (
    <section className="grid gap-2">
      {done && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {t("submitted")}
        </p>
      )}

      {services.map((s) => (
        <div key={s.key} className="rounded-xl border bg-card">
          <button
            type="button"
            onClick={() => {
              setDone(false)
              reset()
              setOpen(open === s.key ? null : s.key)
            }}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start text-sm font-semibold"
          >
            <span>{label(s)}</span>
            <span className="text-muted-foreground">{open === s.key ? "−" : "+"}</span>
          </button>

          {open === s.key && (
            <div className="grid gap-3 border-t px-4 py-3">
              {s.editsDeviceData && (
                <>
                  <p className="text-xs text-muted-foreground">{t("reviewNotice")}</p>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`brand-${s.key}`}>{t("brand")}</Label>
                    <Input
                      id={`brand-${s.key}`}
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`model-${s.key}`}>{t("model")}</Label>
                    <Input
                      id={`model-${s.key}`}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`type-${s.key}`}>{t("deviceType")}</Label>
                    <Input
                      id={`type-${s.key}`}
                      value={deviceType}
                      onChange={(e) => setDeviceType(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                </>
              )}

              {s.note && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`note-${s.key}`}>{t("note")}</Label>
                  <Textarea
                    id={`note-${s.key}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="button" onClick={() => submit(s)} disabled={loading}>
                {loading ? t("sending") : t("send")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
