"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CalendarCheck2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { confirmOrderCustomerApproval } from "@/lib/actions/orders"
import { translateActionError } from "@/lib/i18n/action-errors"

export function CustomerConfirmationCard({ orderId }: { orderId: string }) {
  const t = useTranslations("orders")
  const router = useRouter()
  const [confirmationDate, setConfirmationDate] = useState("")
  const [pending, startTransition] = useTransition()

  function confirm() {
    if (!confirmationDate) return
    startTransition(async () => {
      const result = await confirmOrderCustomerApproval(orderId, confirmationDate)
      if (result.error) {
        toast.error(translateActionError(result.error))
        return
      }
      toast.success(t("customerConfirmationSaved"))
      router.refresh()
    })
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck2 className="size-5 text-primary" />
          {t("confirmCustomerApproval")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("confirmCustomerApprovalHint")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="order-confirmation-date">{t("customerConfirmationDate")}</Label>
          <Input
            id="order-confirmation-date"
            type="date"
            value={confirmationDate}
            onChange={(event) => setConfirmationDate(event.target.value)}
            className="h-11 bg-background"
          />
        </div>
        <Button className="h-11 sm:min-w-48" onClick={confirm} disabled={!confirmationDate || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck2 className="size-4" />}
          {pending ? t("confirmingCustomerApproval") : t("confirmAndStartBuying")}
        </Button>
      </CardContent>
    </Card>
  )
}
