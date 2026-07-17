export type RfqMessageTemplates = {
  whatsappBody: string
  emailSubject: string
  emailBody: string
}

export const RFQ_TEMPLATE_VARIABLES = [
  "supplier_name",
  "request_ref",
  "request_title",
  "items",
  "company_name",
] as const

type TemplateVariable = (typeof RFQ_TEMPLATE_VARIABLES)[number]
export type MessageTemplateValues = Record<string, string | null | undefined>

export type OperationalMessageTemplates = {
  partnerAssignment: string
  partnerPickup: string
  customerEnRoute: string
  signatureRequest: string
  authorizedSignoff: string
  otpDeliverySubject: string
  otpDeliveryWhatsappBody: string
  otpDeliveryEmailBody: string
  remoteSignatureSubject: string
  remoteSignatureWhatsappBody: string
  remoteSignatureEmailBody: string
  signedReceiptSubject: string
  signedReceiptWhatsappBody: string
  signedReceiptEmailBody: string
}

export const OPERATIONAL_TEMPLATE_VARIABLES = [
  "partner_name", "request_number", "task_link", "po_number", "supplier_name",
  "pickup_address", "pickup_contact", "destination", "items", "courier_name",
  "customer_name", "sign_link", "receiver_name", "delivery_date", "otp",
  "instructions", "receipt_link",
] as const

export const DEFAULT_OPERATIONAL_TEMPLATES: OperationalMessageTemplates = {
  partnerAssignment: [
    "مرحباً {{partner_name}}،",
    "وصلك طلب جديد من كارا رقم {{request_number}}.",
    "افتح الرابط لمراجعة التفاصيل والموافقة:",
    "{{task_link}}",
  ].join("\n"),
  partnerPickup: [
    "مرحباً {{partner_name}}،",
    "مهمة استلام جديدة من كارا للطلب الشرائي رقم {{po_number}}.",
    "المورّد: {{supplier_name}}.",
    "عنوان الاستلام: {{pickup_address}}",
    "جهة الاتصال: {{pickup_contact}}",
    "الأصناف: {{items}}",
    "التسليم إلى: {{destination}}",
    "افتح الرابط لقبول المهمة وتأكيد الاستلام:",
    "{{task_link}}",
  ].join("\n"),
  customerEnRoute: [
    "مرحباً {{customer_name}}،",
    "معك {{courier_name}} من شركة حلول كارا للتأجير.",
    "أنا في الطريق لتسليم طلبكم رقم {{request_number}}.",
    "المحتويات: {{items}}.",
    "برجاء تأكيد الموقع والموعد المناسب للاستلام.",
    "{{sign_link}}",
  ].join("\n"),
  signatureRequest: [
    "مرحباً {{customer_name}}،",
    "يرجى مراجعة سند التسليم للطلب رقم {{request_number}} والتوقيع عليه من الرابط:",
    "{{sign_link}}",
  ].join("\n"),
  authorizedSignoff: [
    "مرحباً {{customer_name}}،",
    "تم تسليم طلب رقم {{request_number}} إلى {{receiver_name}} بتاريخ {{delivery_date}}.",
    "برجاء التكرم بالتوقيع على سند الاستلام للتوثيق:",
    "{{sign_link}}",
  ].join("\n"),
  otpDeliverySubject: "KARA delivery | {{request_number}}",
  otpDeliveryWhatsappBody: [
    "مرحباً {{customer_name}}،",
    "طلبك رقم {{request_number}} جاهز للتسليم من شركة حلول كارا للتأجير.",
    "المحتويات: {{items}}.",
    "",
    "رمز التحقق (OTP): {{otp}}",
    "يرجى إعطاء هذا الرمز لمندوب التوصيل عند الاستلام.",
    "{{instructions}}",
    "",
    "لمراجعة سند التسليم:",
    "{{sign_link}}",
  ].join("\n"),
  otpDeliveryEmailBody: [
    "Dear {{customer_name}},",
    "",
    "Your order {{request_number}} is ready for delivery.",
    "Items: {{items}}",
    "",
    "Delivery verification code (OTP): {{otp}}",
    "Please provide this code to the courier when receiving the order.",
    "{{instructions}}",
    "",
    "Review and sign the delivery note:",
    "{{sign_link}}",
    "",
    "Kind regards,",
    "KARA Solutions",
  ].join("\n"),
  remoteSignatureSubject: "Delivery confirmation required | {{request_number}}",
  remoteSignatureWhatsappBody: [
    "مرحباً {{customer_name}}،",
    "تم تسليم طلبك رقم {{request_number}}، ويتبقى توثيق التوقيع.",
    "يمكنك التوقيع إلكترونياً عبر الرابط الآمن:",
    "{{sign_link}}",
  ].join("\n"),
  remoteSignatureEmailBody: [
    "Dear {{customer_name}},",
    "",
    "Order {{request_number}} has been delivered. Please complete the delivery confirmation by signing through the secure link below:",
    "{{sign_link}}",
    "",
    "Kind regards,",
    "KARA Solutions",
  ].join("\n"),
  signedReceiptSubject: "Signed delivery receipt | {{request_number}}",
  signedReceiptWhatsappBody: [
    "مرحباً {{customer_name}}،",
    "شكراً لك. تم إتمام تسليم طلبك رقم {{request_number}} بنجاح.",
    "يمكنك الاطلاع على سند الاستلام الموقّع من الرابط:",
    "{{receipt_link}}",
  ].join("\n"),
  signedReceiptEmailBody: [
    "Dear {{customer_name}},",
    "",
    "Your order {{request_number}} has been delivered successfully.",
    "Your signed delivery receipt is available at the secure link below:",
    "{{receipt_link}}",
    "",
    "Thank you for choosing KARA Solutions.",
  ].join("\n"),
}

export const DEFAULT_RFQ_TEMPLATES: RfqMessageTemplates = {
  whatsappBody: [
    "مرحباً {{supplier_name}}،",
    "",
    "نرجو تزويدنا بعرض سعر للطلب رقم *{{request_ref}}*:",
    "{{request_title}}",
    "",
    "{{items}}",
    "",
    "يرجى توضيح السعر، التوفر، مدة التوريد والضمان.",
    "",
    "شكراً لكم،",
    "{{company_name}}",
  ].join("\n"),
  emailSubject: "Request for quotation | {{request_ref}} | {{request_title}}",
  emailBody: [
    "Dear {{supplier_name}},",
    "",
    "Please provide your quotation for the following items related to request {{request_ref}}.",
    "",
    "Request: {{request_title}}",
    "",
    "{{items}}",
    "",
    "Please include unit prices, VAT, availability, lead time, warranty, and quotation validity.",
    "",
    "Kind regards,",
    "{{company_name}}",
  ].join("\n"),
}

const VARIABLE_PATTERN = /{{\s*([a-z_]+)\s*}}/g

export function renderMessageTemplate(
  template: string,
  values: Partial<MessageTemplateValues>
): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => {
    return values[key as TemplateVariable] ?? ""
  })
}

export function validateRfqTemplates(templates: RfqMessageTemplates): { error?: string } {
  const fields = [templates.whatsappBody, templates.emailSubject, templates.emailBody]
  for (const field of fields) {
    for (const match of field.matchAll(VARIABLE_PATTERN)) {
      if (!RFQ_TEMPLATE_VARIABLES.includes(match[1] as TemplateVariable)) {
        return { error: `Unknown template variable: {{${match[1]}}}` }
      }
    }
  }

  if (!templates.whatsappBody.includes("{{items}}")) {
    return { error: "WhatsApp template must include {{items}}" }
  }
  if (!templates.emailBody.includes("{{items}}")) {
    return { error: "Email template must include {{items}}" }
  }
  if (!templates.whatsappBody.trim() || !templates.emailSubject.trim() || !templates.emailBody.trim()) {
    return { error: "Templates cannot be empty" }
  }
  if (templates.whatsappBody.length > 4000 || templates.emailBody.length > 10000) {
    return { error: "Template is too long" }
  }
  if (templates.emailSubject.length > 200) return { error: "Email subject is too long" }
  return {}
}

export function validateOperationalTemplates(templates: OperationalMessageTemplates): { error?: string } {
  const allowed = new Set<string>(OPERATIONAL_TEMPLATE_VARIABLES)
  for (const value of Object.values(templates)) {
    if (!value.trim()) return { error: "Templates cannot be empty" }
    if (value.length > 10000) return { error: "Template is too long" }
    for (const match of value.matchAll(VARIABLE_PATTERN)) {
      if (!allowed.has(match[1])) return { error: `Unknown template variable: {{${match[1]}}}` }
    }
  }

  const required: Array<[keyof OperationalMessageTemplates, string]> = [
    ["partnerAssignment", "task_link"],
    ["partnerPickup", "task_link"],
    ["customerEnRoute", "request_number"],
    ["signatureRequest", "sign_link"],
    ["authorizedSignoff", "sign_link"],
    ["otpDeliveryWhatsappBody", "otp"],
    ["otpDeliveryEmailBody", "otp"],
    ["remoteSignatureWhatsappBody", "sign_link"],
    ["remoteSignatureEmailBody", "sign_link"],
    ["signedReceiptWhatsappBody", "receipt_link"],
    ["signedReceiptEmailBody", "receipt_link"],
  ]
  for (const [field, variable] of required) {
    if (!templates[field].includes(`{{${variable}}}`)) {
      return { error: `${String(field)} must include {{${variable}}}` }
    }
  }
  return {}
}
