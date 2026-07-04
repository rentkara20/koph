"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { setRequestLogistics } from "@/lib/actions/requests"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  requestId: string
  origin: string | null
  destination: string | null
  scheduledAt: number | null
}

// Epoch ms → "YYYY-MM-DDTHH:mm" in local time for datetime-local inputs.
function toLocalInput(epoch: number | null): string {
  if (!epoch) return ""
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function LogisticsSection({ requestId, origin, destination, scheduledAt }: Props) {
  const t = useTranslations("requests")
  const tToast = useTranslations("toast")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [originValue, setOriginValue] = useState(origin ?? "")
  const [destinationValue, setDestinationValue] = useState(destination ?? "")
  const [scheduledValue, setScheduledValue] = useState(toLocalInput(scheduledAt))

  function save() {
    startTransition(async () => {
      try {
        const result = await setRequestLogistics(requestId, {
          origin: originValue,
          destination: destinationValue,
          scheduledAt: scheduledValue ? new Date(scheduledValue).getTime() : null,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success(tToast("logisticsSaved"))
        router.refresh()
      } catch {
        toast.error(tToast("genericError"))
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="origin">{t("origin")}</Label>
          <Input
            id="origin"
            value={originValue}
            onChange={(e) => setOriginValue(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destination">{t("destination")}</Label>
          <Input
            id="destination"
            value={destinationValue}
            onChange={(e) => setDestinationValue(e.target.value)}
            disabled={pending}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="scheduledAt">{t("scheduledAt")}</Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          value={scheduledValue}
          onChange={(e) => setScheduledValue(e.target.value)}
          disabled={pending}
          className="w-fit"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </div>
  )
}
