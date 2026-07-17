"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Copy, Mail, MessageCircle, Pencil, Settings2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { sendSupplierRfqEmail } from "@/lib/actions/communications"
import { buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { cn } from "@/lib/utils"

export function RfqMessageActions({
  sourcingRequestId,
  whatsappBody,
  emailSubject,
  emailBody,
  mobile,
  email,
  emailSendingEnabled,
}: {
  sourcingRequestId: string
  whatsappBody: string
  emailSubject: string
  emailBody: string
  mobile: string | null
  email: string | null
  emailSendingEnabled: boolean
}) {
  const t = useTranslations("sourcing")
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [waDraft, setWaDraft] = useState(whatsappBody)
  const [subjectDraft, setSubjectDraft] = useState(emailSubject)
  const [emailDraft, setEmailDraft] = useState(emailBody)

  const whatsappUrl = buildWhatsappUrl(mobile, waDraft)
  const mailtoUrl = email
    ? `mailto:${email}?subject=${encodeURIComponent(subjectDraft)}&body=${encodeURIComponent(emailDraft)}`
    : null

  function review() {
    setWaDraft(whatsappBody)
    setSubjectDraft(emailSubject)
    setEmailDraft(emailBody)
    setOpen(true)
  }

  async function copyMessage(message = waDraft) {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success(t("messageCopied"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  async function sendEmail() {
    if (!email) return
    setSending(true)
    try {
      const result = await sendSupplierRfqEmail({
        sourcingRequestId,
        recipient: email,
        subject: subjectDraft,
        body: emailDraft,
      })
      if (result.error) return toast.error(result.error)
      toast.success(t("emailSent"))
      setOpen(false)
    } catch {
      toast.error(t("emailSendFailed"))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {buildWhatsappUrl(mobile, whatsappBody) && (
          <a
            href={buildWhatsappUrl(mobile, whatsappBody) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <MessageCircle className="size-3.5" />
            {t("sendViaWhatsapp")}
          </a>
        )}
        {email && (
          <Button variant="outline" size="sm" onClick={review} className="gap-1.5">
            <Mail className="size-3.5" />
            {t("sendViaEmail")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={review} className="gap-1.5">
          <Pencil className="size-3.5" />
          {t("reviewMessage")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => copyMessage(whatsappBody)} className="gap-1.5">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {t("copyMessage")}
        </Button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title={t("reviewMessage")}
        panelClassName="w-[min(44rem,100vw)] max-w-full overflow-y-auto bg-background"
      >
        <div className="space-y-6 p-5 pt-14 sm:p-7 sm:pt-14">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("reviewMessage")}</h2>
              <p className="text-sm text-muted-foreground">{t("temporaryEditHint")}</p>
            </div>
            <Link
              href="/admin/settings/message-templates"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
            >
              <Settings2 className="size-4" />
              {t("editDefaultTemplate")}
            </Link>
          </div>

          <section className="space-y-2 rounded-xl border p-4">
            <Label htmlFor="rfqWhatsappDraft">{t("whatsappMessage")}</Label>
            <Textarea
              id="rfqWhatsappDraft"
              dir="auto"
              rows={11}
              value={waDraft}
              onChange={(event) => setWaDraft(event.target.value)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => copyMessage(waDraft)}>
                <Copy className="size-4" /> {t("copyMessage")}
              </Button>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <MessageCircle className="size-4" /> {t("openWhatsapp")}
                </a>
              )}
            </div>
          </section>

          {email && (
            <section className="space-y-3 rounded-xl border p-4">
              <div className="space-y-2">
                <Label htmlFor="rfqEmailSubject">{t("emailSubject")}</Label>
                <Input
                  id="rfqEmailSubject"
                  dir="auto"
                  value={subjectDraft}
                  onChange={(event) => setSubjectDraft(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfqEmailBody">{t("emailMessage")}</Label>
                <Textarea
                  id="rfqEmailBody"
                  dir="auto"
                  rows={12}
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                {emailSendingEnabled ? t("professionalEmailHint") : t("emailAppFallbackHint")}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {mailtoUrl && (
                  <a href={mailtoUrl} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    <Mail className="size-4" /> {t("openEmailApp")}
                  </a>
                )}
                {emailSendingEnabled && (
                  <Button size="sm" onClick={sendEmail} disabled={sending || !subjectDraft.trim() || !emailDraft.trim()}>
                    <Mail className="size-4" /> {sending ? t("sendingEmail") : t("sendProfessionalEmail")}
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>
      </Sheet>
    </>
  )
}
