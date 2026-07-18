"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { appSettings } from "@/lib/db/schema"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { SYSTEM_DEFAULT_PROOF, type ProofRequirements } from "@/lib/domain/proof"
import { OTP_EXPIRY_MIN_HOURS, OTP_EXPIRY_MAX_HOURS } from "@/lib/utils/otp-hash"
import {
  DEFAULT_RFQ_TEMPLATES,
  DEFAULT_OPERATIONAL_TEMPLATES,
  DEFAULT_WARRANTY_REQUEST_TEMPLATES,
  validateRfqTemplates,
  validateOperationalTemplates,
  validateWarrantyRequestTemplates,
  type OperationalMessageTemplates,
  type RfqMessageTemplates,
  type WarrantyRequestMessageTemplates,
} from "@/lib/domain/message-templates"
import { ENGLISH_FONT_OPTIONS, type EnglishFontFamily } from "@/lib/domain/fonts"

export type SettingsActionResult = { error?: string }

// ─── Generic scalar settings store ─────────────────────────────────────────
// Value is JSON-encoded so callers can store numbers/booleans/strings without
// a new column per setting. Typed getters below are the public surface —
// avoid calling getSetting/setSetting directly outside this file.

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key))
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

async function setSetting(key: string, value: unknown, userId: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value: JSON.stringify(value), updatedBy: userId, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(value), updatedBy: userId, updatedAt: Date.now() },
    })
}

// ─── Outbound message templates ────────────────────────────────────────────

export async function getRfqMessageTemplates(): Promise<RfqMessageTemplates> {
  const stored = await getSetting<Partial<RfqMessageTemplates>>("messageTemplate.rfq", {})
  return {
    whatsappBody: stored.whatsappBody || DEFAULT_RFQ_TEMPLATES.whatsappBody,
    emailSubject: stored.emailSubject || DEFAULT_RFQ_TEMPLATES.emailSubject,
    emailBody: stored.emailBody || DEFAULT_RFQ_TEMPLATES.emailBody,
  }
}

export async function readRfqMessageTemplatesForAdmin(): Promise<RfqMessageTemplates | null> {
  const session = await getSessionWithRole("admin")
  if (!session) return null
  return getRfqMessageTemplates()
}

export async function updateRfqMessageTemplates(
  input: RfqMessageTemplates
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const validation = validateRfqTemplates(input)
  if (validation.error) return validation

  await setSetting("messageTemplate.rfq", input, session.user.id)
  revalidatePath("/admin/settings/message-templates")
  revalidatePath("/admin/sourcing", "layout")
  return {}
}

export async function resetRfqMessageTemplates(): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await setSetting("messageTemplate.rfq", DEFAULT_RFQ_TEMPLATES, session.user.id)
  revalidatePath("/admin/settings/message-templates")
  revalidatePath("/admin/sourcing", "layout")
  return {}
}

// ─── Warranty request message ───────────────────────────────────────────────

export async function getWarrantyRequestMessageTemplates(): Promise<WarrantyRequestMessageTemplates> {
  const stored = await getSetting<Partial<WarrantyRequestMessageTemplates>>("messageTemplate.warrantyRequest", {})
  return {
    whatsappBody: stored.whatsappBody || DEFAULT_WARRANTY_REQUEST_TEMPLATES.whatsappBody,
    emailSubject: stored.emailSubject || DEFAULT_WARRANTY_REQUEST_TEMPLATES.emailSubject,
    emailBody: stored.emailBody || DEFAULT_WARRANTY_REQUEST_TEMPLATES.emailBody,
  }
}

export async function readWarrantyRequestTemplatesForAdmin(): Promise<WarrantyRequestMessageTemplates | null> {
  const session = await getSessionWithRole("admin")
  if (!session) return null
  return getWarrantyRequestMessageTemplates()
}

export async function updateWarrantyRequestTemplates(
  input: WarrantyRequestMessageTemplates
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const validation = validateWarrantyRequestTemplates(input)
  if (validation.error) return validation

  await setSetting("messageTemplate.warrantyRequest", input, session.user.id)
  revalidatePath("/admin/settings/message-templates")
  revalidatePath("/admin/warranty", "layout")
  return {}
}

export async function resetWarrantyRequestTemplates(): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  await setSetting("messageTemplate.warrantyRequest", DEFAULT_WARRANTY_REQUEST_TEMPLATES, session.user.id)
  revalidatePath("/admin/settings/message-templates")
  revalidatePath("/admin/warranty", "layout")
  return {}
}

export async function getOperationalMessageTemplates(): Promise<OperationalMessageTemplates> {
  const stored = await getSetting<Partial<OperationalMessageTemplates>>("messageTemplate.operational", {})
  return { ...DEFAULT_OPERATIONAL_TEMPLATES, ...stored }
}

export async function readOperationalMessageTemplatesForAdmin(): Promise<OperationalMessageTemplates | null> {
  const session = await getSessionWithRole("admin")
  if (!session) return null
  return getOperationalMessageTemplates()
}

export async function updateOperationalMessageTemplates(
  input: OperationalMessageTemplates
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  const validation = validateOperationalTemplates(input)
  if (validation.error) return validation

  await setSetting("messageTemplate.operational", input, session.user.id)
  revalidatePath("/admin/settings/message-templates")
  revalidatePath("/admin", "layout")
  revalidatePath("/task", "layout")
  return {}
}

export async function resetOperationalMessageTemplates(): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  await setSetting("messageTemplate.operational", DEFAULT_OPERATIONAL_TEMPLATES, session.user.id)
  revalidatePath("/admin/settings/message-templates")
  revalidatePath("/admin", "layout")
  revalidatePath("/task", "layout")
  return {}
}

// ─── Request & task settings ────────────────────────────────────────────────

const DEFAULTS = {
  requiredDeliveryPhotoCount: 1,
  taskTokenTtlDays: 7,
  activationTokenTtlHours: 72,
  businessMonthOffsetHours: 3, // Riyadh (UTC+3) — see lib/actions/payments.ts
  deliveryOtpExpiryHours: 24, // Phase-0 default; admin-configurable up to 72
} as const

export type RequestTaskSettings = {
  requiredDeliveryPhotoCount: number
  taskTokenTtlDays: number
  activationTokenTtlHours: number
}

export async function getRequestTaskSettings(): Promise<RequestTaskSettings> {
  const [requiredDeliveryPhotoCount, taskTokenTtlDays, activationTokenTtlHours] = await Promise.all([
    getSetting("requiredDeliveryPhotoCount", DEFAULTS.requiredDeliveryPhotoCount),
    getSetting("taskTokenTtlDays", DEFAULTS.taskTokenTtlDays),
    getSetting("activationTokenTtlHours", DEFAULTS.activationTokenTtlHours),
  ])
  return { requiredDeliveryPhotoCount, taskTokenTtlDays, activationTokenTtlHours }
}

// Public (unauthenticated) reads — needed by the partner magic-link flow
// (photo requirement check) and task creation (token TTL). Bounded to a safe
// range server-side regardless of what's stored, so a bad value in the table
// can't disable the photo requirement or create an infinite-lived token.

export async function getRequiredDeliveryPhotoCount(): Promise<number> {
  const n = await getSetting("requiredDeliveryPhotoCount", DEFAULTS.requiredDeliveryPhotoCount)
  return Math.min(10, Math.max(0, Math.floor(n)))
}

export async function getTaskTokenTtlMs(): Promise<number> {
  const days = await getSetting("taskTokenTtlDays", DEFAULTS.taskTokenTtlDays)
  const bounded = Math.min(30, Math.max(1, Math.floor(days)))
  return bounded * 24 * 60 * 60 * 1000
}

export async function getActivationTokenTtlMs(): Promise<number> {
  const hours = await getSetting("activationTokenTtlHours", DEFAULTS.activationTokenTtlHours)
  const bounded = Math.min(24 * 14, Math.max(1, Math.floor(hours)))
  return bounded * 60 * 60 * 1000
}

/**
 * The timezone offset used to bucket partner payments into calendar-month
 * batches (see lib/actions/payments.ts). Bounded to a real UTC offset range
 * so a bad value can't produce an invalid SQLite datetime() modifier.
 */
export async function getBusinessMonthOffsetHours(): Promise<number> {
  const hours = await getSetting("businessMonthOffsetHours", DEFAULTS.businessMonthOffsetHours)
  return Math.min(14, Math.max(-12, Math.round(hours)))
}

/** Formats the offset as a SQLite datetime() modifier, e.g. "+3 hours". */
export async function getBusinessMonthOffsetModifier(): Promise<string> {
  const hours = await getBusinessMonthOffsetHours()
  const sign = hours >= 0 ? "+" : "-"
  return `${sign}${Math.abs(hours)} hours`
}

export async function updateRequestTaskSettings(
  input: Partial<RequestTaskSettings>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.requiredDeliveryPhotoCount !== undefined) {
    const n = input.requiredDeliveryPhotoCount
    if (!Number.isInteger(n) || n < 0 || n > 10) return { error: "Photo count must be 0–10" }
    await setSetting("requiredDeliveryPhotoCount", n, session.user.id)
  }
  if (input.taskTokenTtlDays !== undefined) {
    const n = input.taskTokenTtlDays
    if (!Number.isInteger(n) || n < 1 || n > 30) return { error: "Task link expiry must be 1–30 days" }
    await setSetting("taskTokenTtlDays", n, session.user.id)
  }
  if (input.activationTokenTtlHours !== undefined) {
    const n = input.activationTokenTtlHours
    if (!Number.isInteger(n) || n < 1 || n > 24 * 14) return { error: "Activation link expiry must be 1 hour to 14 days" }
    await setSetting("activationTokenTtlHours", n, session.user.id)
  }

  revalidatePath("/admin/settings/request-tasks")
  return {}
}

export async function readRequestTaskSettingsForAdmin(): Promise<RequestTaskSettings | null> {
  const session = await getStaffSession()
  if (!session) return null
  return getRequestTaskSettings()
}

// ─── Delivery OTP settings ────────────────────────────────────────────────────

/** OTP expiry in hours, bounded 1–72 (default 24) regardless of stored value. */
export async function getDeliveryOtpExpiryHours(): Promise<number> {
  const h = await getSetting("deliveryOtpExpiryHours", DEFAULTS.deliveryOtpExpiryHours)
  return Math.min(OTP_EXPIRY_MAX_HOURS, Math.max(OTP_EXPIRY_MIN_HOURS, Math.floor(h)))
}

export async function getDeliveryOtpExpiryMs(): Promise<number> {
  return (await getDeliveryOtpExpiryHours()) * 60 * 60 * 1000
}

export async function readDeliveryOtpSettingsForAdmin(): Promise<{ expiryHours: number } | null> {
  const session = await getStaffSession()
  if (!session) return null
  return { expiryHours: await getDeliveryOtpExpiryHours() }
}

export async function updateDeliveryOtpSettings(
  input: Partial<{ expiryHours: number }>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.expiryHours !== undefined) {
    const n = input.expiryHours
    if (!Number.isInteger(n) || n < OTP_EXPIRY_MIN_HOURS || n > OTP_EXPIRY_MAX_HOURS) {
      return { error: `OTP expiry must be ${OTP_EXPIRY_MIN_HOURS}–${OTP_EXPIRY_MAX_HOURS} hours` }
    }
    await setSetting("deliveryOtpExpiryHours", n, session.user.id)
  }

  revalidatePath("/admin/settings/request-tasks")
  return {}
}

// ─── Warranty settings ───────────────────────────────────────────────────────

const WARRANTY_DEFAULTS = {
  warrantyExpiryAlertDays: 30,
} as const

/** Days-before-expiry threshold for the "expiring soon" warranty bucket, bounded 1–180 (default 30). */
export async function getWarrantyExpiryAlertDays(): Promise<number> {
  const days = await getSetting("warrantyExpiryAlertDays", WARRANTY_DEFAULTS.warrantyExpiryAlertDays)
  return Math.min(180, Math.max(1, Math.floor(days)))
}

export async function readWarrantySettingsForAdmin(): Promise<{ expiryAlertDays: number } | null> {
  const session = await getStaffSession()
  if (!session) return null
  return { expiryAlertDays: await getWarrantyExpiryAlertDays() }
}

export async function updateWarrantySettings(
  input: Partial<{ expiryAlertDays: number }>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.expiryAlertDays !== undefined) {
    const n = input.expiryAlertDays
    if (!Number.isInteger(n) || n < 1 || n > 180) return { error: "Expiry alert window must be 1–180 days" }
    await setSetting("warrantyExpiryAlertDays", n, session.user.id)
  }

  revalidatePath("/admin/warranty")
  revalidatePath("/admin/settings/warranty")
  return {}
}

// ─── Pricing & payments settings ────────────────────────────────────────────

export type PricingPaymentSettings = {
  businessMonthOffsetHours: number
}

export async function getPricingPaymentSettings(): Promise<PricingPaymentSettings> {
  return { businessMonthOffsetHours: await getBusinessMonthOffsetHours() }
}

export async function readPricingPaymentSettingsForAdmin(): Promise<PricingPaymentSettings | null> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return null
  return getPricingPaymentSettings()
}

export async function updatePricingPaymentSettings(
  input: Partial<PricingPaymentSettings>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  if (input.businessMonthOffsetHours !== undefined) {
    const n = input.businessMonthOffsetHours
    if (!Number.isInteger(n) || n < -12 || n > 14) {
      return { error: "Timezone offset must be between UTC-12 and UTC+14" }
    }
    await setSetting("businessMonthOffsetHours", n, session.user.id)
  }

  revalidatePath("/admin/settings/pricing-payments")
  revalidatePath("/admin/payments")
  return {}
}

// ─── Proof & verification settings (OI-0) ────────────────────────────────────
// Enforcement is OFF by default so operators can author per-request-type proof
// config BEFORE the gate starts blocking sign-off. The system default is the
// last link in the resolution chain (lib/domain/proof.ts).

export type ProofSettings = {
  enforcementEnabled: boolean
  systemDefault: ProofRequirements
}

export async function isProofEnforcementEnabled(): Promise<boolean> {
  return getSetting("proofEnforcementEnabled", false)
}

export async function getSystemDefaultProof(): Promise<ProofRequirements> {
  const signature = await getSetting("proofDefaultSignature", SYSTEM_DEFAULT_PROOF.signature)
  const photos = await getSetting("proofDefaultPhotos", SYSTEM_DEFAULT_PROOF.photos)
  return {
    signature: Boolean(signature),
    photos: Math.min(10, Math.max(0, Math.floor(Number(photos)))),
  }
}

export async function readProofSettingsForAdmin(): Promise<ProofSettings | null> {
  const session = await getStaffSession()
  if (!session) return null
  const [enforcementEnabled, systemDefault] = await Promise.all([
    isProofEnforcementEnabled(),
    getSystemDefaultProof(),
  ])
  return { enforcementEnabled, systemDefault }
}

export async function updateProofSettings(
  input: Partial<{ enforcementEnabled: boolean; signature: boolean; photos: number }>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.enforcementEnabled !== undefined) {
    await setSetting("proofEnforcementEnabled", Boolean(input.enforcementEnabled), session.user.id)
  }
  if (input.signature !== undefined) {
    await setSetting("proofDefaultSignature", Boolean(input.signature), session.user.id)
  }
  if (input.photos !== undefined) {
    const n = input.photos
    if (!Number.isInteger(n) || n < 0 || n > 10) return { error: "Photo count must be 0–10" }
    await setSetting("proofDefaultPhotos", n, session.user.id)
  }

  revalidatePath("/admin/settings/proof")
  return {}
}

// ─── Notification settings ──────────────────────────────────────────────────

export type NotificationSettings = {
  retentionDays: number
  weeklyDigestEnabled: boolean
}

const NOTIFICATION_DEFAULTS = { retentionDays: 90, weeklyDigestEnabled: true } as const

export async function getNotificationRetentionDays(): Promise<number> {
  const n = await getSetting("notificationRetentionDays", NOTIFICATION_DEFAULTS.retentionDays)
  return Math.min(365, Math.max(7, Math.floor(n)))
}

export async function isWeeklyDigestEnabled(): Promise<boolean> {
  return getSetting("weeklyDigestEnabled", NOTIFICATION_DEFAULTS.weeklyDigestEnabled)
}

export async function readNotificationSettingsForAdmin(): Promise<NotificationSettings | null> {
  const session = await getSessionWithRole("admin")
  if (!session) return null
  const [retentionDays, weeklyDigestEnabled] = await Promise.all([
    getNotificationRetentionDays(),
    isWeeklyDigestEnabled(),
  ])
  return { retentionDays, weeklyDigestEnabled }
}

export async function updateNotificationSettings(
  input: Partial<NotificationSettings>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.retentionDays !== undefined) {
    const n = input.retentionDays
    if (!Number.isInteger(n) || n < 7 || n > 365) return { error: "Retention must be 7–365 days" }
    await setSetting("notificationRetentionDays", n, session.user.id)
  }
  if (input.weeklyDigestEnabled !== undefined) {
    await setSetting("weeklyDigestEnabled", input.weeklyDigestEnabled, session.user.id)
  }

  revalidatePath("/admin/settings/notifications")
  return {}
}

// ─── Branding & locale settings ─────────────────────────────────────────────

export type BrandingSettings = {
  defaultLocale: "en" | "ar"
  englishFontFamily: EnglishFontFamily
}

export async function getDefaultLocale(): Promise<"en" | "ar"> {
  const locale = await getSetting<"en" | "ar">("defaultLocale", "en")
  return locale === "ar" ? "ar" : "en"
}

export async function getEnglishFontFamily(): Promise<EnglishFontFamily> {
  const font = await getSetting<EnglishFontFamily>("englishFontFamily", "geist")
  return ENGLISH_FONT_OPTIONS.includes(font) ? font : "geist"
}

export async function readBrandingSettingsForAdmin(): Promise<BrandingSettings | null> {
  const session = await getSessionWithRole("admin")
  if (!session) return null
  const [defaultLocale, englishFontFamily] = await Promise.all([
    getDefaultLocale(),
    getEnglishFontFamily(),
  ])
  return { defaultLocale, englishFontFamily }
}

export async function updateBrandingSettings(
  input: Partial<BrandingSettings>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.defaultLocale !== undefined) {
    if (input.defaultLocale !== "en" && input.defaultLocale !== "ar") {
      return { error: "Locale must be en or ar" }
    }
    await setSetting("defaultLocale", input.defaultLocale, session.user.id)
  }

  if (input.englishFontFamily !== undefined) {
    if (!ENGLISH_FONT_OPTIONS.includes(input.englishFontFamily)) {
      return { error: "Unsupported font family" }
    }
    await setSetting("englishFontFamily", input.englishFontFamily, session.user.id)
  }

  revalidatePath("/admin/settings/branding")
  revalidatePath("/", "layout")
  return {}
}

// ─── Integration settings ───────────────────────────────────────────────────

export type IntegrationSettings = {
  notionSyncForceDisabled: boolean
  notionConfigured: boolean
}

/** Admin kill-switch on top of the env-based check in lib/integrations/notion.ts — lets ops pause the mirror without a redeploy. */
export async function isNotionSyncForceDisabled(): Promise<boolean> {
  return getSetting("notionSyncForceDisabled", false)
}

export async function readIntegrationSettingsForAdmin(): Promise<IntegrationSettings | null> {
  const session = await getSessionWithRole("admin")
  if (!session) return null
  const notionSyncForceDisabled = await isNotionSyncForceDisabled()
  const notionConfigured = Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATA_SOURCE_ID)
  return { notionSyncForceDisabled, notionConfigured }
}

export async function updateIntegrationSettings(
  input: Partial<IntegrationSettings>
): Promise<SettingsActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  if (input.notionSyncForceDisabled !== undefined) {
    await setSetting("notionSyncForceDisabled", input.notionSyncForceDisabled, session.user.id)
  }

  revalidatePath("/admin/settings/integrations")
  return {}
}
