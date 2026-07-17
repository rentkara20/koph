"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  confirmSupplierReturn,
  createSupplierReturn,
  receiveSupplierReplacement,
} from "@/lib/actions/supplier-returns"
import { translateActionError } from "@/lib/i18n/action-errors"

type ReturnRecord = {
  id: string
  resolution: "replacement" | "refund"
  status: "requested" | "awaiting_replacement" | "replacement_received" | "resolved" | "cancelled"
  reason: string
  rmaReference: string | null
  replacementAssetId: string | null
}

export function SupplierReturnCard({
  assetId,
  assetStatus,
  record,
}: {
  assetId: string
  assetStatus: string
  record: ReturnRecord | null
}) {
  const t = useTranslations("assets.supplierReturn")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resolution, setResolution] = useState<"replacement" | "refund">("replacement")
  const [reason, setReason] = useState("")
  const [rmaReference, setRmaReference] = useState("")
  const [replacementSerial, setReplacementSerial] = useState("")

  const run = (action: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(success)
      router.refresh()
    })

  if (!record && assetStatus !== "damaged") return null

  return (
    <section className="space-y-4 rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div>
        <h2 className="font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {!record && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier-return-resolution">{t("resolution")}</Label>
            <Select
              id="supplier-return-resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value as "replacement" | "refund")}
            >
              <option value="replacement">{t("resolutions.replacement")}</option>
              <option value="refund">{t("resolutions.refund")}</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="supplier-return-reason">{t("reason")}</Label>
            <Textarea
              id="supplier-return-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("reasonPlaceholder")}
              maxLength={500}
            />
          </div>
          <Button
            className="sm:w-fit"
            disabled={pending || !reason.trim()}
            onClick={() => run(
              () => createSupplierReturn({ assetId, resolution, reason }),
              t("created")
            )}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
        </div>
      )}

      {record && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>{t("status")}: <strong>{t(`statuses.${record.status}`)}</strong></span>
            <span>{t("resolution")}: <strong>{t(`resolutions.${record.resolution}`)}</strong></span>
          </div>
          <p className="rounded-lg bg-background/70 p-3 text-sm">{record.reason}</p>

          {record.status === "requested" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="supplier-return-rma">{t("rmaReference")}</Label>
                <Input
                  id="supplier-return-rma"
                  value={rmaReference}
                  onChange={(event) => setRmaReference(event.target.value)}
                  placeholder={t("rmaOptional")}
                  dir="ltr"
                />
              </div>
              <Button
                disabled={pending}
                onClick={() => run(
                  () => confirmSupplierReturn(record.id, rmaReference),
                  t("returnedDone")
                )}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("confirmReturned")}
              </Button>
            </div>
          )}

          {record.status === "awaiting_replacement" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="replacement-serial">{t("replacementSerial")}</Label>
                <Input
                  id="replacement-serial"
                  value={replacementSerial}
                  onChange={(event) => setReplacementSerial(event.target.value)}
                  placeholder={t("replacementSerialPlaceholder")}
                  dir="ltr"
                />
              </div>
              <Button
                disabled={pending || !replacementSerial.trim()}
                onClick={() => run(
                  () => receiveSupplierReplacement(record.id, replacementSerial),
                  t("replacementReceived")
                )}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("receiveReplacement")}
              </Button>
            </div>
          )}

          {record.replacementAssetId && (
            <Link href={`/admin/assets/${record.replacementAssetId}`} className="text-sm font-medium text-primary hover:underline">
              {t("openReplacement")}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
