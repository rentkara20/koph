"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Copy, ExternalLink, MessageCircle, AlertTriangle } from "lucide-react"
import { createAdHocPartnerTask } from "@/lib/actions/ad-hoc-partner-tasks"
import { buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

type PartnerOption = {
  id: string
  name: string
  mobile: string | null
  contracts: { id: string; name: string }[]
}

const REASONS = ["manual_pickup", "internal_delivery", "supplier_visit", "asset_transfer", "other"] as const

export function NewAdHocTaskForm({ partners }: { partners: PartnerOption[] }) {
  const t = useTranslations("tasks")
  const tReason = useTranslations("tasks.adHocReason")
  const tCommon = useTranslations("common")

  const [partnerId, setPartnerId] = useState("")
  const [contractId, setContractId] = useState("")
  const [adHocReason, setAdHocReason] = useState<(typeof REASONS)[number]>("manual_pickup")
  const [adHocTitle, setAdHocTitle] = useState("")
  const [destinationLocation, setDestinationLocation] = useState("")
  const [notes, setNotes] = useState("")
  const [photoRequired, setPhotoRequired] = useState(false)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<{ link: string; waUrl: string | null } | null>(null)

  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId), [partners, partnerId])
  const contracts = selectedPartner?.contracts ?? []
  const hasNoContract = !!selectedPartner && contracts.length === 0

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await createAdHocPartnerTask({
        partnerId,
        adHocTitle: adHocTitle.trim(),
        adHocReason,
        contractId,
        destinationLocation: destinationLocation.trim() || undefined,
        notes: notes.trim() || undefined,
        photoRequired,
      })
      if (result.error || !result.taskToken) {
        setError(result.error ? translateActionError(result.error) : "Failed to create task")
        setLoading(false)
        return
      }
      const link = `${window.location.origin}/task/${result.taskToken}`
      const waUrl = buildWhatsappUrl(
        selectedPartner?.mobile,
        `${adHocTitle.trim()}\n${t("adHocWhatsappHint")}\n${link}`
      )
      setCreated({ link, waUrl })
      toast.success(t("adHocCreated"))
    } catch {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ {t("adHocCreated")}
        </div>

        {created.waUrl ? (
          <Link
            href={created.waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants(), "w-full gap-2 bg-green-600 hover:bg-green-700")}
          >
            <MessageCircle className="size-4" />
            {t("adHocSendWhatsapp")}
          </Link>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {t("adHocNoMobile")}
          </p>
        )}

        <div className="space-y-1.5">
          <Label>{t("adHocTaskLink")}</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={created.link} className="font-mono text-xs" dir="ltr" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(created.link)
                toast.success(tCommon("copied"))
              }}
            >
              <Copy className="size-4" />
            </Button>
            <Link
              href={created.link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
            >
              <ExternalLink className="size-4" />
            </Link>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/admin/partners/tasks" className={cn(buttonVariants({ variant: "outline" }))}>
            {tCommon("done")}
          </Link>
          <Button
            type="button"
            onClick={() => {
              setCreated(null)
              setAdHocTitle("")
              setDestinationLocation("")
              setNotes("")
              setLoading(false)
            }}
          >
            {t("adHocCreateAnother")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="partnerId">
            {t("partner")} <span className="text-destructive">*</span>
          </Label>
          <Select
            id="partnerId"
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value)
              setContractId("")
            }}
            required
          >
            <option value="">{tCommon("select")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contractId">
            {t("contract")} <span className="text-destructive">*</span>
          </Label>
          <Select
            id="contractId"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            disabled={hasNoContract}
            required
          >
            <option value="">{tCommon("select")}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {hasNoContract && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="size-3.5 shrink-0" />
              {t("adHocNoContract")}{" "}
              <Link href={`/admin/partners/${partnerId}`} className="font-medium text-primary hover:underline">
                {t("adHocCreateContract")}
              </Link>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adHocReason">
            {t("adHocReasonLabel")} <span className="text-destructive">*</span>
          </Label>
          <Select
            id="adHocReason"
            value={adHocReason}
            onChange={(e) => setAdHocReason(e.target.value as (typeof REASONS)[number])}
            required
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {tReason(r)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="destinationLocation">
            {t("adHocDestination")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Input
            id="destinationLocation"
            value={destinationLocation}
            onChange={(e) => setDestinationLocation(e.target.value)}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="adHocTitle">
            {t("adHocTitleLabel")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="adHocTitle"
            value={adHocTitle}
            onChange={(e) => setAdHocTitle(e.target.value)}
            maxLength={200}
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">
            {tCommon("notes")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
        </div>

        <label className="flex items-center gap-2 sm:col-span-2 text-sm">
          <input
            type="checkbox"
            checked={photoRequired}
            onChange={(e) => setPhotoRequired(e.target.checked)}
            className="size-4"
          />
          {t("adHocPhotoRequired")}
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-3">
        <Link href="/admin/partners/tasks" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("cancel")}
        </Link>
        <Button type="submit" disabled={loading || !partnerId || !contractId || !adHocTitle.trim()}>
          {loading ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  )
}
