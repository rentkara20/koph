"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  appSettings,
  deviceClaims,
  deviceServiceRequests,
  labelDevices,
  orderUnits,
  type DeviceServiceRequest,
} from "@/lib/db/schema"
import { createId, generateSecureToken } from "@/lib/utils/ids"
import { getSessionWithRole } from "@/lib/auth/session"
import { notifyAdmins } from "@/lib/utils/notify"
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { firstError } from "@/lib/validation/schemas"
import {
  DEFAULT_SERVICES,
  type DeviceService,
  normaliseSerial,
  SERVICES_SETTING_KEY,
} from "@/lib/domain/device-portal"


async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function getDeviceServiceCatalogue(): Promise<DeviceService[]> {
  const list = await readSetting<DeviceService[]>(SERVICES_SETTING_KEY, DEFAULT_SERVICES)
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_SERVICES
}

// ─── PII masking ────────────────────────────────────────────────────────────
// A stranger who scans the sticker must not learn the holder's contact
// details. First name only, everything else structurally masked — never the
// real characters, so the mask cannot be reversed by inspecting it.

function maskName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ""
  return first ? `${first} ••••` : "••••"
}

function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at <= 0) return "••••"
  const dot = email.lastIndexOf(".")
  const tld = dot > at ? email.slice(dot) : ""
  return `${email[0]}••••@••••${tld}`
}

function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "")
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••"
}

// ─── Holder cookie ──────────────────────────────────────────────────────────
// One cookie per device, keyed by serial. httpOnly so page scripts (and any
// injected script) cannot read the secret; 2-year life to outlast a rental.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 730

function cookieName(serial: string): string {
  return `kara_dc_${serial.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`
}

async function readHolderSecret(serial: string): Promise<string | null> {
  const jar = await cookies()
  return jar.get(cookieName(serial))?.value ?? null
}

async function findUnitBySerial(serial: string) {
  const norm = normaliseSerial(serial)
  if (!norm || norm.length > 40) return null
  // Normalise on the SQL side so the lookup uses one indexed-ish scan of the
  // serial column instead of pulling every unit into memory. Stored serials
  // may carry dashes/spaces the printed URL strips.
  const normalised = sql`UPPER(REPLACE(REPLACE(REPLACE(${orderUnits.serialNumber}, '-', ''), ' ', ''), '_', ''))`
  const [row] = await db
    .select({
      id: orderUnits.id,
      serialNumber: orderUnits.serialNumber,
      brand: orderUnits.brand,
      model: orderUnits.model,
      deviceType: orderUnits.deviceType,
      assetTag: orderUnits.assetTag,
      kind: orderUnits.kind,
      status: orderUnits.status,
      warrantyEnd: orderUnits.warrantyEnd,
      retiredAt: orderUnits.retiredAt,
    })
    .from(orderUnits)
    .where(eq(normalised, norm))
    .limit(1)
  if (row) return row

  // Fall back to the label studio: a sticker may be printed for a device Kara
  // has not received into inventory yet. The sticker still has to resolve —
  // the printed URL cannot be reissued later.
  const [label] = await db
    .select({
      id: labelDevices.id,
      serialNumber: labelDevices.serialNumber,
      brand: labelDevices.brand,
      model: labelDevices.model,
      deviceType: labelDevices.deviceType,
      warrantyEnd: sql<number | null>`NULL`,
    })
    .from(labelDevices)
    .where(eq(labelDevices.serialKey, norm))
    .limit(1)
  if (!label) return null

  return {
    ...label,
    assetTag: null as string | null,
    kind: null as string | null,
    status: null as string | null,
    retiredAt: null as number | null,
  }
}

// ─── Public device page ─────────────────────────────────────────────────────

export type DevicePublicView = {
  serial: string
  brand: string | null
  model: string | null
  deviceType: string | null
  assetTag: string | null
  warrantyEnd: number | null
  /** Coarse state only — never the customer, order, or price. */
  inService: boolean
  activated: boolean
  /** true when THIS browser holds the active claim. */
  isHolder: boolean
  /** Full values only for the holder or KARA staff; masked for everyone else. */
  holder: { name: string; email: string; mobile: string } | null
  claimedAt: number | null
}

export async function getDevicePublicView(rawSerial: string): Promise<DevicePublicView | null> {
  const unit = await findUnitBySerial(rawSerial)
  if (!unit || !unit.serialNumber) return null

  const norm = normaliseSerial(unit.serialNumber)
  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(and(eq(deviceClaims.serialNumber, norm), eq(deviceClaims.status, "active")))
    .limit(1)

  const secret = await readHolderSecret(norm)
  const isHolder = Boolean(claim && secret && secret === claim.holderSecret)
  const staff = await getSessionWithRole("admin", "finance", "viewer")
  const seesFull = isHolder || Boolean(staff)

  return {
    serial: unit.serialNumber,
    brand: unit.brand,
    model: unit.model,
    deviceType: unit.deviceType,
    assetTag: unit.assetTag,
    warrantyEnd: unit.warrantyEnd,
    inService: !unit.retiredAt,
    activated: Boolean(claim),
    isHolder,
    holder: claim
      ? seesFull
        ? { name: claim.holderName, email: claim.holderEmail, mobile: claim.holderMobile }
        : {
            name: maskName(claim.holderName),
            email: maskEmail(claim.holderEmail),
            mobile: maskMobile(claim.holderMobile),
          }
      : null,
    claimedAt: claim?.claimedAt ?? null,
  }
}

// ─── Activation / transfer ──────────────────────────────────────────────────

const activationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  mobile: z
    .string()
    .trim()
    .min(9)
    .max(20)
    .regex(/^[0-9+\s-]+$/, "invalid_mobile"),
  consent: z.literal(true),
  reason: z.string().trim().max(200).optional(),
})

/**
 * Claims a device for the person scanning it. When the device already has a
 * holder this is a TRANSFER: the previous claim is released (kept as history,
 * never overwritten) and admins are notified, so a wrongful claim is visible
 * and reversible rather than silent. This is the "documented" protection level
 * — no approval wait, full audit trail.
 */
export async function activateDevice(rawSerial: string, input: unknown) {
  const parsed = activationSchema.safeParse(input)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const unit = await findUnitBySerial(rawSerial)
  if (!unit || !unit.serialNumber) return { error: "not_found" }
  const norm = normaliseSerial(unit.serialNumber)

  if (!checkRateLimit(`device-activate:${norm}`, 5)) return { error: "rate_limited" }

  const { name, email, mobile, reason } = parsed.data
  const secret = generateSecureToken()
  const stamp = Date.now()

  const isTransfer = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(deviceClaims)
      .where(and(eq(deviceClaims.serialNumber, norm), eq(deviceClaims.status, "active")))
      .limit(1)

    if (existing) {
      await tx
        .update(deviceClaims)
        .set({
          status: "released",
          releasedAt: stamp,
          releaseReason: reason || "transferred_by_new_holder",
        })
        .where(eq(deviceClaims.id, existing.id))
    }

    await tx.insert(deviceClaims).values({
      id: createId(),
      serialNumber: norm,
      holderName: name,
      holderEmail: email,
      holderMobile: mobile,
      holderSecret: secret,
      consentAt: stamp,
      status: "active",
      claimedAt: stamp,
    })

    return Boolean(existing)
  })

  const jar = await cookies()
  jar.set(cookieName(norm), secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: `/d`,
  })

  await notifyAdmins({
    type: isTransfer ? "device_claim_transferred" : "device_claim_activated",
    i18nKey: isTransfer
      ? "notifications.deviceClaimTransferred"
      : "notifications.deviceClaimActivated",
    i18nData: { serial: unit.serialNumber, holder: maskName(name) },
    linkUrl: `/d/${norm}`,
    entityType: "device_claim",
    entityId: norm,
  })

  revalidatePath(`/d/${norm}`)
  return { ok: true, transferred: isTransfer }
}

/** Holder hands the device back: releases the claim and clears the cookie. */
export async function releaseDevice(rawSerial: string, reason?: string) {
  const unit = await findUnitBySerial(rawSerial)
  if (!unit || !unit.serialNumber) return { error: "not_found" }
  const norm = normaliseSerial(unit.serialNumber)

  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(and(eq(deviceClaims.serialNumber, norm), eq(deviceClaims.status, "active")))
    .limit(1)
  if (!claim) return { error: "not_found" }

  const secret = await readHolderSecret(norm)
  const staff = await getSessionWithRole("admin")
  if (secret !== claim.holderSecret && !staff) return { error: "forbidden" }

  await db
    .update(deviceClaims)
    .set({
      status: "released",
      releasedAt: Date.now(),
      releaseReason: (reason || "released_by_holder").slice(0, 200),
    })
    .where(eq(deviceClaims.id, claim.id))

  const jar = await cookies()
  jar.delete(cookieName(norm))
  revalidatePath(`/d/${norm}`)
  return { ok: true }
}

// ─── Service requests ───────────────────────────────────────────────────────

export type DeviceServicesView = {
  serial: string
  brand: string | null
  model: string | null
  deviceType: string | null
  isHolder: boolean
  holderName: string | null
  services: DeviceService[]
  requests: Array<Pick<DeviceServiceRequest, "id" | "kind" | "status" | "createdAt"> & {
    payload: Record<string, unknown>
  }>
}

export async function getDeviceServicesView(
  rawSerial: string
): Promise<DeviceServicesView | null> {
  const unit = await findUnitBySerial(rawSerial)
  if (!unit || !unit.serialNumber) return null
  const norm = normaliseSerial(unit.serialNumber)

  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(and(eq(deviceClaims.serialNumber, norm), eq(deviceClaims.status, "active")))
    .limit(1)

  const secret = await readHolderSecret(norm)
  const isHolder = Boolean(claim && secret && secret === claim.holderSecret)
  const staff = await getSessionWithRole("admin", "finance", "viewer")

  // Request history is the holder's own data — never shown to a stranger.
  const rows =
    isHolder || staff
      ? await db
          .select()
          .from(deviceServiceRequests)
          .where(eq(deviceServiceRequests.serialNumber, norm))
          .orderBy(desc(deviceServiceRequests.createdAt))
          .limit(20)
      : []

  const catalogue = await getDeviceServiceCatalogue()

  return {
    serial: unit.serialNumber,
    brand: unit.brand,
    model: unit.model,
    deviceType: unit.deviceType,
    isHolder,
    holderName: isHolder && claim ? claim.holderName : null,
    services: catalogue.filter((s) => s.enabled),
    requests: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt,
      payload: safeJson(r.payload),
    })),
  }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const requestSchema = z.object({
  kind: z.string().trim().min(1).max(40),
  note: z.string().trim().max(1000).optional(),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(200).optional(),
  deviceType: z.string().trim().max(80).optional(),
})

/**
 * Files a request against the device. Only the current holder may file one.
 *
 * A device-data correction is recorded as a PROPOSAL, never applied to
 * order_unit here: whoever physically holds a device could otherwise rewrite
 * inventory records. An admin applies it via applyDeviceServiceRequest.
 */
export async function submitDeviceServiceRequest(rawSerial: string, input: unknown) {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const unit = await findUnitBySerial(rawSerial)
  if (!unit || !unit.serialNumber) return { error: "not_found" }
  const norm = normaliseSerial(unit.serialNumber)

  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(and(eq(deviceClaims.serialNumber, norm), eq(deviceClaims.status, "active")))
    .limit(1)
  if (!claim) return { error: "not_activated" }

  const secret = await readHolderSecret(norm)
  if (secret !== claim.holderSecret) return { error: "forbidden" }

  if (!checkRateLimit(`device-request:${norm}`, 10)) return { error: "rate_limited" }

  const catalogue = await getDeviceServiceCatalogue()
  const service = catalogue.find((s) => s.key === parsed.data.kind && s.enabled)
  if (!service) return { error: "invalid_service" }

  const payload: Record<string, string> = {}
  if (parsed.data.note) payload.note = parsed.data.note
  if (service.editsDeviceData) {
    if (parsed.data.brand) payload.brand = parsed.data.brand
    if (parsed.data.model) payload.model = parsed.data.model
    if (parsed.data.deviceType) payload.deviceType = parsed.data.deviceType
    if (!payload.brand && !payload.model && !payload.deviceType && !payload.note) {
      return { error: "empty_request" }
    }
  } else if (!payload.note) {
    return { error: "empty_request" }
  }

  await db.insert(deviceServiceRequests).values({
    id: createId(),
    serialNumber: norm,
    claimId: claim.id,
    kind: service.key,
    payload: JSON.stringify(payload),
    status: "submitted",
  })

  await notifyAdmins({
    type: "device_service_request",
    i18nKey: "notifications.deviceServiceRequest",
    i18nData: { serial: unit.serialNumber, service: service.labelAr },
    linkUrl: "/admin/device-portal",
    entityType: "device_service_request",
    entityId: norm,
  })

  revalidatePath(`/d/${norm}/services`)
  return { ok: true }
}

// ─── Admin review ───────────────────────────────────────────────────────────

export async function listDeviceServiceRequests(status = "submitted") {
  const staff = await getSessionWithRole("admin", "finance", "viewer")
  if (!staff) return { error: "forbidden" as const }

  const rows = await db
    .select()
    .from(deviceServiceRequests)
    .where(eq(deviceServiceRequests.status, status))
    .orderBy(desc(deviceServiceRequests.createdAt))
    .limit(100)

  return {
    rows: rows.map((r) => ({
      id: r.id,
      serialNumber: r.serialNumber,
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt,
      payload: safeJson(r.payload),
    })),
  }
}

/**
 * Applies or rejects a pending request. Applying a device-data proposal is the
 * ONLY path by which a portal submission reaches order_unit.
 */
export async function reviewDeviceServiceRequest(
  id: string,
  decision: "applied" | "rejected",
  adminNote?: string
) {
  const staff = await getSessionWithRole("admin")
  if (!staff) return { error: "forbidden" }

  const catalogue = await getDeviceServiceCatalogue()

  const result = await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(deviceServiceRequests)
      .where(eq(deviceServiceRequests.id, id))
      .limit(1)
    if (!req) return { error: "not_found" as const }
    if (req.status !== "submitted") return { error: "already_reviewed" as const }

    if (decision === "applied") {
      const service = catalogue.find((s) => s.key === req.kind)
      if (service?.editsDeviceData) {
        const p = safeJson(req.payload)
        const patch: Record<string, string> = {}
        if (typeof p.brand === "string" && p.brand) patch.brand = p.brand
        if (typeof p.model === "string" && p.model) patch.model = p.model
        if (typeof p.deviceType === "string" && p.deviceType) patch.deviceType = p.deviceType

        if (Object.keys(patch).length > 0) {
          const normalised = sql`UPPER(REPLACE(REPLACE(REPLACE(${orderUnits.serialNumber}, '-', ''), ' ', ''), '_', ''))`
          const [target] = await tx
            .select({ id: orderUnits.id })
            .from(orderUnits)
            .where(eq(normalised, req.serialNumber))
            .limit(1)
          if (!target) return { error: "not_found" as const }
          await tx.update(orderUnits).set(patch).where(eq(orderUnits.id, target.id))
        }
      }
    }

    await tx
      .update(deviceServiceRequests)
      .set({
        status: decision,
        adminNote: adminNote?.slice(0, 500),
        reviewedBy: staff.user.id,
        reviewedAt: Date.now(),
      })
      .where(eq(deviceServiceRequests.id, id))

    return { ok: true as const }
  })

  if ("error" in result) return result
  revalidatePath("/admin/device-portal")
  return result
}
