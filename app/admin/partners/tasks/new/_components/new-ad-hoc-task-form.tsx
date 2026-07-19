"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Copy, ExternalLink } from "lucide-react"
import { createAdHocPartnerTask } from "@/lib/actions/ad-hoc-partner-tasks"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { translateActionError } from "@/lib/i18n/action-errors"

type PartnerOption = { id: string; name: string; contracts: { id: string; name: string }[] }

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
  const [photoRequired, setPhotoRequired] = useState(true)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [createdLink, setCreatedLink] = useState<string | null>(null)

  const contracts = useMemo(
    () => partners.find((p) => p.id === partnerId)?.contracts ?? [],
    [partners, partnerId]
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await createAdHocPartnerTask({
        partnerId,
        adHocTitle: adHocTitle.trim(),
        adHocReason,
        contractId: contractId || undefined,
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
      setCreatedLink(link)
      toast.success(t("adHocCreated"))
    } catch {
      setError("An unexpected error occurred")
      setLoading(false)
    }
  }

  if (createdLink) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ {t("adHocCreated")}
        </div>
        <div className="space-y-1.5">
          <Label>{t("adHocTaskLink")}</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={createdLink} className="font-mono text-xs" dir="ltr" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(createdLink)
                toast.success(tCommon("copied"))
              }}
            >
              <Copy className="size-4" />
            </Button>
            <Link
              href={createdLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
            >
              <ExternalLink className="size-4" />
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">{t("adHocLinkHint")}</p>
        </div>
        <div className="flex justify-end gap-3">
          <Link href="/admin/partners" className={cn(buttonVariants({ variant: "outline" }))}>
            {tCommon("done")}
          </Link>
          <Button
            type="button"
            onClick={() => {
              setCreatedLink(null)
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
            {t("contract")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
          </Label>
          <Select
            id="contractId"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            disabled={contracts.length === 0}
          >
            <option value="">{tCommon("none")}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
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
        <Link href="/admin/partners" className={cn(buttonVariants({ variant: "outline" }))}>
          {tCommon("cancel")}
        </Link>
        <Button type="submit" disabled={loading || !partnerId || !adHocTitle.trim()}>
          {loading ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  )
}
