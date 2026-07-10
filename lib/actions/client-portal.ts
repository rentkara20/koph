"use server"

import { and, desc, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  customers,
  customerCallbackRequests,
  customerPortalTokens,
  orderUnits,
  requests,
  signatureRequests,
} from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { getSessionWithRole } from "@/lib/auth/session"
import { notifyAdmins } from "@/lib/utils/notify"
import { checkRateLimit } from "@/lib/utils/rate-limit"
import { firstError } from "@/lib/validation/schemas"

type ActionResult = { error?: string; url?: string }

// ─── Admin: mint (or return the existing) portal link for a customer ────────
export async function getOrCreatePortalLink(customerId: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [existing] = await db
    .select()
    .from(customerPortalTokens)
    .where(eq(customerPortalTokens.customerId, customerId))
  if (existing) return { url: `/client/${existing.token}` }

  const token = generateToken()
  // customerId is unique — a concurrent/double-clicked mint would otherwise
  // throw on the constraint. Swallow the conflict and return the winning row.
  await db
    .insert(customerPortalTokens)
    .values({ id: createId(), customerId, token })
    .onConflictDoNothing({ target: customerPortalTokens.customerId })
  const [row] = await db
    .select({ token: customerPortalTokens.token })
    .from(customerPortalTokens)
    .where(eq(customerPortalTokens.customerId, customerId))
  return { url: `/client/${row?.token ?? token}` }
}

// ─── Public: read-only portal data for a customer ────────────────────────────
export async function getClientPortalData(token: string) {
  if (!checkRateLimit(`client-portal:${token}`, 60)) return null

  const [portal] = await db
    .select()
    .from(customerPortalTokens)
    .where(eq(customerPortalTokens.token, token))
  if (!portal) return null

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, portal.customerId), isNull(customers.deletedAt)))
  if (!customer) return null

  const customerRequests = await db
    .select({
      id: requests.id,
      requestNumber: requests.requestNumber,
      quoteNumber: requests.quoteNumber,
      status: requests.status,
      deliveryDate: requests.deliveryDate,
      collectionDate: requests.collectionDate,
    })
    .from(requests)
    .where(and(eq(requests.customerId, customer.id), isNull(requests.deletedAt)))
    .orderBy(desc(requests.createdAt))
    .limit(100)

  const assignedAssets = await db
    .select({
      id: orderUnits.id,
      assetTag: orderUnits.assetTag,
      serialNumber: orderUnits.serialNumber,
      status: orderUnits.status,
      currentRequestId: orderUnits.currentRequestId,
    })
    .from(orderUnits)
    .where(eq(orderUnits.currentCustomerId, customer.id))

  const signatures = await db
    .select({
      id: signatureRequests.id,
      secureToken: signatureRequests.secureToken,
      documentName: signatureRequests.documentName,
      status: signatureRequests.status,
      requestId: signatureRequests.requestId,
    })
    .from(signatureRequests)
    .where(eq(signatureRequests.customerId, customer.id))
    .orderBy(desc(signatureRequests.createdAt))
    .limit(50)

  return {
    customer: { id: customer.id, name: customer.name },
    requests: customerRequests,
    assets: assignedAssets,
    signatures,
  }
}

const callbackSchema = z.object({
  requestId: z.string().trim().max(60).optional(),
  kind: z.enum(["return", "extension", "issue"]),
  message: z.string().trim().max(1000).optional(),
})

// ─── Public: customer asks for a return / extension / reports an issue ──────
export async function requestCallback(
  token: string,
  data: { requestId?: string; kind: "return" | "extension" | "issue"; message?: string }
): Promise<ActionResult> {
  if (!checkRateLimit(`client-callback:${token}`, 10)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }

  const parsed = callbackSchema.safeParse(data)
  if (!parsed.success) return { error: firstError(parsed.error) }

  const [portal] = await db
    .select()
    .from(customerPortalTokens)
    .where(eq(customerPortalTokens.token, token))
  if (!portal) return { error: "Not found" }

  const [customer] = await db.select().from(customers).where(eq(customers.id, portal.customerId))
  if (!customer) return { error: "Not found" }

  // Constrain requestId to this token's customer — a caller must not be able to
  // attach a callback to another customer's request (IDOR / notification spoof).
  let scopedRequestId: string | null = null
  if (parsed.data.requestId) {
    const [ownedRequest] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.id, parsed.data.requestId),
          eq(requests.customerId, portal.customerId),
          isNull(requests.deletedAt)
        )
      )
    if (!ownedRequest) return { error: "Not found" }
    scopedRequestId = ownedRequest.id
  }

  await db.insert(customerCallbackRequests).values({
    id: createId(),
    customerId: portal.customerId,
    requestId: scopedRequestId,
    kind: parsed.data.kind,
    message: parsed.data.message || null,
  })

  await notifyAdmins({
    type: "customer_callback",
    i18nKey: "notifications.customerCallback",
    i18nData: { customerName: customer.name, kind: parsed.data.kind },
    linkUrl: `/admin/customers/${customer.id}`,
    entityType: "request",
    entityId: scopedRequestId ?? customer.id,
  })

  return {}
}
