"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Pause, RotateCcw, Save } from "lucide-react"
import { holdPayment, releasePayment, updatePaymentLine } from "@/lib/actions/payments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function PaymentLineEditor({
  paymentId,
  amount,
  notes,
  status,
  serviceType,
  serviceDescription,
}: {
  paymentId: string
  amount: number
  notes: string | null
  status: string
  serviceType: string | null
  serviceDescription: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const locked = status === "paid"

  async function save(formData: FormData) {
    setPending(true)
    const result = await updatePaymentLine(paymentId, formData)
    setPending(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Payment line updated")
    router.refresh()
  }

  async function toggleHold() {
    setPending(true)
    const result = status === "on_hold" ? await releasePayment(paymentId) : await holdPayment(paymentId)
    setPending(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(status === "on_hold" ? "Payment released" : "Payment held")
    router.refresh()
  }

  if (locked) {
    return (
      <div className="flex items-center justify-end gap-2 text-xs text-green-700">
        <Check className="size-3.5" />
        Paid
      </div>
    )
  }

  return (
    <form action={save} className="grid min-w-[34rem] grid-cols-[8rem_1fr_6rem_1fr_auto_auto] items-center gap-2">
      <select
        name="financeServiceType"
        defaultValue={serviceType ?? ""}
        className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
      >
        <option value="">Service</option>
        <option value="Delivery">Delivery</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Pickup">Pickup</option>
        <option value="Hardware">Hardware</option>
        <option value="Software">Software</option>
        <option value="Inspection">Inspection</option>
      </select>
      <Input name="financeServiceDescription" defaultValue={serviceDescription} placeholder="Service description" />
      <Input
        name="totalAmount"
        type="number"
        min="0"
        step="0.01"
        defaultValue={amount.toFixed(2)}
        className="text-end tabular-nums"
      />
      <Input name="notes" defaultValue={notes ?? ""} placeholder="Notes" />
      <Button type="submit" variant="outline" size="icon-sm" disabled={pending} title="Save line">
        <Save className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        onClick={toggleHold}
        title={status === "on_hold" ? "Release" : "Hold"}
        className={status === "on_hold" ? "text-amber-700" : ""}
      >
        {status === "on_hold" ? <RotateCcw className="size-3.5" /> : <Pause className="size-3.5" />}
      </Button>
    </form>
  )
}
