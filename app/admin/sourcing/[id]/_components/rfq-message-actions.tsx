"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Copy, Mail, MessageCircle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Per-RFQ outbound actions (V1: operator's own WhatsApp/mail client).
// The message text is composed server-side (lib/domain/rfq-message.ts) so all
// three channels carry identical wording.
export function RfqMessageActions({
  message,
  emailSubject,
  whatsappUrl,
  email,
}: {
  message: string
  emailSubject: string
  whatsappUrl: string | null
  email: string | null
}) {
  const t = useTranslations("sourcing")
  const [copied, setCopied] = useState(false)

  const mailtoUrl = email
    ? `mailto:${email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message)}`
    : null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success(t("messageCopied"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <MessageCircle className="size-3.5" />
          {t("sendViaWhatsapp")}
        </a>
      )}
      {mailtoUrl && (
        <a href={mailtoUrl} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          <Mail className="size-3.5" />
          {t("sendViaEmail")}
        </a>
      )}
      <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {t("copyMessage")}
      </Button>
    </div>
  )
}
