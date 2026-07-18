"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ChevronDown, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import {
  resetOperationalMessageTemplates,
  resetRfqMessageTemplates,
  resetWarrantyRequestTemplates,
  updateOperationalMessageTemplates,
  updateRfqMessageTemplates,
  updateWarrantyRequestTemplates,
} from "@/lib/actions/settings"
import {
  DEFAULT_OPERATIONAL_TEMPLATES,
  DEFAULT_RFQ_TEMPLATES,
  DEFAULT_WARRANTY_REQUEST_TEMPLATES,
  OPERATIONAL_TEMPLATE_VARIABLES,
  RFQ_TEMPLATE_VARIABLES,
  WARRANTY_REQUEST_TEMPLATE_VARIABLES,
  renderMessageTemplate,
  validateOperationalTemplates,
  validateRfqTemplates,
  validateWarrantyRequestTemplates,
  type OperationalMessageTemplates,
  type RfqMessageTemplates,
  type WarrantyRequestMessageTemplates,
} from "@/lib/domain/message-templates"
import { buildRfqMessages } from "@/lib/domain/rfq-message"
import { buildWarrantyRequestMessages } from "@/lib/domain/warranty-request-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const SAMPLE_ITEMS = [
  { quantity: 10, supplierDescription: "Lenovo ThinkPad L16, 32GB RAM", partNumber: "21L16" },
  { quantity: 5, supplierDescription: "LG 27-inch 4K Monitor", partNumber: null },
]

const SAMPLE_VALUES = {
  partner_name: "أحمد",
  request_number: "REQ-2026-0042",
  task_link: "https://koph.example/task/abc",
  po_number: "PO-1042",
  supplier_name: "Gulf IT",
  pickup_address: "الرياض — العليا",
  pickup_contact: "محمد · 05xxxxxxxx",
  destination: "مستودع كارا",
  items: "• 10× Lenovo ThinkPad\n• 5× LG Monitor",
  courier_name: "مندوب كارا",
  customer_name: "ACME Arabia",
  sign_link: "https://koph.example/sign/abc",
  receiver_name: "Mohammed Ahmed",
  delivery_date: "17 July 2026",
  otp: "482193",
  instructions: "Please have the receiver's ID ready.",
  receipt_link: "https://koph.example/sign/abc/print",
}

const GROUPS: Array<{
  id: string
  fields: Array<{ key: keyof OperationalMessageTemplates; kind: "subject" | "whatsapp" | "body" }>
}> = [
  { id: "partnerAssignment", fields: [{ key: "partnerAssignment", kind: "body" }] },
  { id: "partnerPickup", fields: [{ key: "partnerPickup", kind: "body" }] },
  { id: "customerEnRoute", fields: [{ key: "customerEnRoute", kind: "body" }] },
  { id: "signatureRequest", fields: [{ key: "signatureRequest", kind: "body" }] },
  { id: "authorizedSignoff", fields: [{ key: "authorizedSignoff", kind: "body" }] },
  {
    id: "otpDelivery",
    fields: [
      { key: "otpDeliverySubject", kind: "subject" },
      { key: "otpDeliveryWhatsappBody", kind: "whatsapp" },
      { key: "otpDeliveryEmailBody", kind: "body" },
    ],
  },
  {
    id: "remoteSignature",
    fields: [
      { key: "remoteSignatureSubject", kind: "subject" },
      { key: "remoteSignatureWhatsappBody", kind: "whatsapp" },
      { key: "remoteSignatureEmailBody", kind: "body" },
    ],
  },
  {
    id: "signedReceipt",
    fields: [
      { key: "signedReceiptSubject", kind: "subject" },
      { key: "signedReceiptWhatsappBody", kind: "whatsapp" },
      { key: "signedReceiptEmailBody", kind: "body" },
    ],
  },
]

export function MessageTemplateSettingsForm({
  rfqInitial,
  operationalInitial,
  warrantyRequestInitial,
}: {
  rfqInitial: RfqMessageTemplates
  operationalInitial: OperationalMessageTemplates
  warrantyRequestInitial: WarrantyRequestMessageTemplates
}) {
  const t = useTranslations("messageTemplates")
  const router = useRouter()
  const [rfq, setRfq] = useState(rfqInitial)
  const [operational, setOperational] = useState(operationalInitial)
  const [warrantyRequest, setWarrantyRequest] = useState(warrantyRequestInitial)
  const [saving, setSaving] = useState(false)

  const rfqPreview = useMemo(
    () =>
      buildRfqMessages(
        {
          supplierContactName: "Ahmed",
          externalRef: "ORD-2026-0042",
          title: "Office laptops",
          items: SAMPLE_ITEMS,
        },
        rfq
      ),
    [rfq]
  )

  const warrantyRequestPreview = useMemo(
    () =>
      buildWarrantyRequestMessages(
        {
          supplierContactName: "Ahmed",
          warrantyProductName: "AppleCare+",
          batchRef: "A1B2C3D4",
          items: [
            { serial: "SN-0001", device: "iPhone 14 Pro, 128GB" },
            { serial: "SN-0002", device: "iPhone 14 Pro, 128GB" },
          ],
        },
        warrantyRequest
      ),
    [warrantyRequest]
  )

  async function save() {
    const validation =
      validateRfqTemplates(rfq).error ??
      validateOperationalTemplates(operational).error ??
      validateWarrantyRequestTemplates(warrantyRequest).error
    if (validation) return toast.error(validation)
    setSaving(true)
    try {
      const rfqResult = await updateRfqMessageTemplates(rfq)
      if (rfqResult.error) return toast.error(rfqResult.error)
      const operationalResult = await updateOperationalMessageTemplates(operational)
      if (operationalResult.error) return toast.error(operationalResult.error)
      const warrantyResult = await updateWarrantyRequestTemplates(warrantyRequest)
      if (warrantyResult.error) return toast.error(warrantyResult.error)
      toast.success(t("saved"))
      router.refresh()
    } catch {
      toast.error(t("saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!window.confirm(t("resetConfirm"))) return
    setSaving(true)
    try {
      const [rfqResult, operationalResult, warrantyResult] = await Promise.all([
        resetRfqMessageTemplates(),
        resetOperationalMessageTemplates(),
        resetWarrantyRequestTemplates(),
      ])
      const error = rfqResult.error ?? operationalResult.error ?? warrantyResult.error
      if (error) return toast.error(error)
      setRfq(DEFAULT_RFQ_TEMPLATES)
      setOperational(DEFAULT_OPERATIONAL_TEMPLATES)
      setWarrantyRequest(DEFAULT_WARRANTY_REQUEST_TEMPLATES)
      toast.success(t("resetDone"))
      router.refresh()
    } catch {
      toast.error(t("resetFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-7">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">{t("variables")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
          {[...new Set([...RFQ_TEMPLATE_VARIABLES, ...OPERATIONAL_TEMPLATE_VARIABLES, ...WARRANTY_REQUEST_TEMPLATE_VARIABLES])].map((variable) => (
            <code key={variable} className="rounded bg-background px-2 py-1 text-xs">{`{{${variable}}}`}</code>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("variablesHint")}</p>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">{t("types.rfq")}</h2>
          <p className="text-sm text-muted-foreground">{t("rfqHint")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsappBody">{t("whatsappBody")}</Label>
            <Textarea id="whatsappBody" dir="auto" rows={12} value={rfq.whatsappBody} onChange={(e) => setRfq((v) => ({ ...v, whatsappBody: e.target.value }))} />
          </div>
          <MessagePreview label={t("previewWhatsapp")} value={rfqPreview.whatsappBody} whatsapp />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="emailSubject">{t("emailSubject")}</Label>
              <Input id="emailSubject" dir="auto" value={rfq.emailSubject} onChange={(e) => setRfq((v) => ({ ...v, emailSubject: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailBody">{t("emailBody")}</Label>
              <Textarea id="emailBody" dir="auto" rows={11} value={rfq.emailBody} onChange={(e) => setRfq((v) => ({ ...v, emailBody: e.target.value }))} />
            </div>
          </div>
          <EmailPreview subject={rfqPreview.emailSubject} body={rfqPreview.emailBody} />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">{t("types.warrantyRequest")}</h2>
          <p className="text-sm text-muted-foreground">{t("warrantyRequestHint")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="warrantyWhatsappBody">{t("whatsappBody")}</Label>
            <Textarea
              id="warrantyWhatsappBody"
              dir="auto"
              rows={12}
              value={warrantyRequest.whatsappBody}
              onChange={(e) => setWarrantyRequest((v) => ({ ...v, whatsappBody: e.target.value }))}
            />
          </div>
          <MessagePreview label={t("previewWhatsapp")} value={warrantyRequestPreview.whatsappBody} whatsapp />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="warrantyEmailSubject">{t("emailSubject")}</Label>
              <Input
                id="warrantyEmailSubject"
                dir="auto"
                value={warrantyRequest.emailSubject}
                onChange={(e) => setWarrantyRequest((v) => ({ ...v, emailSubject: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warrantyEmailBody">{t("emailBody")}</Label>
              <Textarea
                id="warrantyEmailBody"
                dir="auto"
                rows={11}
                value={warrantyRequest.emailBody}
                onChange={(e) => setWarrantyRequest((v) => ({ ...v, emailBody: e.target.value }))}
              />
            </div>
          </div>
          <EmailPreview subject={warrantyRequestPreview.emailSubject} body={warrantyRequestPreview.emailBody} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t("otherMessages")}</h2>
          <p className="text-sm text-muted-foreground">{t("otherMessagesHint")}</p>
        </div>
        {GROUPS.map((group) => (
          <details key={group.id} className="group rounded-xl border bg-card" open={group.id === "customerEnRoute"}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium">
              {t(`types.${group.id}` as never)}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
              <div className="space-y-4">
                {group.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>
                      {field.kind === "subject" ? t("emailSubject") : field.kind === "whatsapp" ? t("whatsappBody") : group.fields.some((item) => item.kind === "subject") ? t("emailBody") : t("messageBody")}
                    </Label>
                    {field.kind === "subject" ? (
                      <Input id={field.key} dir="auto" value={operational[field.key]} onChange={(e) => setOperational((v) => ({ ...v, [field.key]: e.target.value }))} />
                    ) : (
                      <Textarea id={field.key} dir="auto" rows={9} value={operational[field.key]} onChange={(e) => setOperational((v) => ({ ...v, [field.key]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {group.fields.map((field) => (
                  <MessagePreview
                    key={field.key}
                    label={field.kind === "subject" ? t("previewSubject") : field.kind === "whatsapp" ? t("previewWhatsapp") : t("previewMessage")}
                    value={renderMessageTemplate(operational[field.key], SAMPLE_VALUES)}
                    whatsapp={field.kind === "whatsapp" || (field.kind === "body" && !group.fields.some((item) => item.kind === "subject"))}
                  />
                ))}
              </div>
            </div>
          </details>
        ))}
      </section>

      <div className="sticky bottom-4 flex flex-wrap justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button type="button" variant="outline" onClick={reset} disabled={saving}>
          <RotateCcw className="size-4" /> {t("restore")}
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="size-4" /> {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  )
}

function MessagePreview({ label, value, whatsapp = false }: { label: string; value: string; whatsapp?: boolean }) {
  return (
    <div className={whatsapp ? "rounded-2xl border bg-[#efeae2] p-4" : "rounded-xl border bg-muted/30 p-4"}>
      <p className="mb-3 text-xs font-medium text-muted-foreground">{label}</p>
      <div className={whatsapp ? "ms-auto max-w-[92%] whitespace-pre-wrap rounded-xl rounded-es-sm bg-[#d9fdd3] p-3 text-sm leading-6 shadow-sm" : "whitespace-pre-wrap text-sm leading-6"} dir="auto">
        {value}
      </div>
    </div>
  )
}

function EmailPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="bg-[#512A83] px-5 py-4 text-sm font-semibold text-white">KARA · KOPH</div>
      <div className="border-b px-5 py-3 text-sm"><span className="text-muted-foreground">Subject: </span>{subject}</div>
      <div className="whitespace-pre-wrap px-5 py-5 text-sm leading-7" dir="auto">{body}</div>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">Kara Solutions · Riyadh, Saudi Arabia</div>
    </div>
  )
}
