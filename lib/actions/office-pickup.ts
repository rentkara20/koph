// Closing a request the customer collected from a KARA office.
//
// See lib/domain/office-pickup.ts for the rules and why this path has to exist:
// request status is derived from partner tasks, so a counter handover — which
// has no task, no trip and nothing to pay a partner — could never be closed.
"use server"

import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  customerSignatures,
  deliveryTaskItems,
  partnerTasks,
  requestItems,
  requestTypes,
  requests,
  orderUnits,
  signatureRequests,
} from "@/lib/db/schema"
import { getSessionWithRole } from "@/lib/auth/session"
import { applyAssetTransition, AssetTransitionError } from "@/lib/actions/asset-transition"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { logActivity } from "@/lib/utils/activity"
import { decideOfficePickup, type OfficePickupRefusal } from "@/lib/domain/office-pickup"
import { ACTIVE_TASK_STATUSES } from "@/lib/domain/request-status"

type ActionResult = { error?: string; success?: boolean; delivered?: number }

const REFUSAL_MESSAGES: Record<OfficePickupRefusal, string> = {
  ALREADY_CLOSED: "This request has already been handed over or closed",
  WRONG_TYPE: "Only a delivery, installation or swap can be handed over at the office",
  NO_DEVICES: "No devices are linked to this request",
  DEVICES_NOT_READY: "Some devices are not in a state that can be handed over",
  OPEN_PARTNER_TASK: "A partner task is still open on this request — close or cancel it first",
}

const schema = z.object({
  requestId: z.string().min(1),
  notes: z.string().trim().max(1000).optional(),
})

/**
 * Record that the customer collected this request's devices over the counter:
 * every assigned unit becomes "delivered" through the asset chokepoint, and the
 * request closes as completed with who handed it over.
 *
 * Deliberately does NOT create a partner task or payment — nobody made a trip.
 */
export async function completeOfficePickup(requestId: string, notes?: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = schema.safeParse({ requestId, notes })
  if (!parsed.success) return { error: "Invalid input" }

  try {
    const delivered = await db.transaction(async (tx) => {
      const [req] = await tx
        .select({
          id: requests.id,
          number: requests.requestNumber,
          status: requests.status,
          customerId: requests.customerId,
          slug: requestTypes.slug,
        })
        .from(requests)
        .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
        .where(and(eq(requests.id, parsed.data.requestId), isNull(requests.deletedAt)))
      if (!req) throw new OfficePickupError("Request not found")

      const items = await tx
        .select({ id: requestItems.id, orderUnitId: requestItems.orderUnitId })
        .from(requestItems)
        .where(eq(requestItems.requestId, req.id))
      const unitIds = items.map((i) => i.orderUnitId).filter((v): v is string => Boolean(v))

      const units = unitIds.length
        ? await tx
            .select({ id: orderUnits.id, status: orderUnits.status })
            .from(orderUnits)
            .where(inArray(orderUnits.id, unitIds))
        : []

      // Open tasks, counted both ways a task can point at a request (the legacy
      // column and delivery_task_item membership), mirroring syncRequestStatus.
      const [byColumn, byItems] = await Promise.all([
        tx
          .select({ id: partnerTasks.id })
          .from(partnerTasks)
          .where(and(eq(partnerTasks.requestId, req.id), inArray(partnerTasks.status, [...ACTIVE_TASK_STATUSES]))),
        items.length
          ? tx
              .selectDistinct({ id: partnerTasks.id })
              .from(partnerTasks)
              .innerJoin(deliveryTaskItems, eq(deliveryTaskItems.partnerTaskId, partnerTasks.id))
              .where(
                and(
                  inArray(deliveryTaskItems.requestItemId, items.map((i) => i.id)),
                  inArray(partnerTasks.status, [...ACTIVE_TASK_STATUSES]),
                ),
              )
          : Promise.resolve([]),
      ])
      const openTaskCount = new Set([...byColumn, ...byItems].map((t) => t.id)).size

      // Any signature captured against this request counts — electronic, or an
      // uploaded paper note. The paper may also arrive after the handover, so
      // its absence is a warning on the trail, never a block.
      const [signed] = await tx
        .select({ n: sql<number>`count(*)` })
        .from(customerSignatures)
        .innerJoin(signatureRequests, eq(signatureRequests.id, customerSignatures.signatureRequestId))
        .where(eq(signatureRequests.requestId, req.id))

      const decision = decideOfficePickup({
        requestStatus: req.status,
        requestTypeSlug: req.slug,
        unitStatuses: units.map((u) => u.status),
        openTaskCount,
        hasSignature: Number(signed?.n ?? 0) > 0,
      })
      if (!decision.allowed) throw new OfficePickupError(REFUSAL_MESSAGES[decision.refusal!])

      const now = Date.now()
      const trail = [
        `Collected by the customer at the KARA office, handed over by ${session.user.name ?? session.user.id}.`,
        decision.withoutSignature ? "No signed receipt was captured at the time of handover." : null,
        parsed.data.notes ?? null,
      ]
        .filter(Boolean)
        .join(" ")

      for (const unit of units) {
        if (unit.status !== "assigned") continue
        await applyAssetTransition(tx, unit.id, "deliver", { notes: trail, byUserId: session.user.id })
      }

      // Guarded on the status we decided against, so a concurrent sign-off
      // cannot be overwritten by this close.
      const res = await tx
        .update(requests)
        .set({
          status: "completed",
          fulfilmentMode: "customer_pickup",
          pickupHandedOverBy: session.user.id,
          pickupHandedOverAt: now,
          updatedAt: now,
        })
        .where(and(eq(requests.id, req.id), eq(requests.status, req.status)))
      if (((res as { rowsAffected?: number }).rowsAffected ?? 1) === 0) {
        throw new OfficePickupError("This request changed while you were working on it — please retry")
      }

      await logActivity(
        {
          entityType: "request",
          entityId: req.id,
          action: "status_changed",
          i18nKey: "activity.officePickupCompleted",
          i18nData: { count: decision.deliverCount },
          performedAs: "user",
          performedBy: session.user.id,
        },
        tx,
      )

      await emitDomainEvent(tx, {
        aggregateType: "request",
        aggregateId: req.id,
        eventType: "RequestCompleted",
        payload: {
          requestNumber: req.number,
          fulfilmentMode: "customer_pickup",
          deliveredCount: decision.deliverCount,
          withoutSignature: decision.withoutSignature,
        },
        dedupeKey: `request:${req.id}:RequestCompleted:office_pickup`,
        actorUserId: session.user.id,
      })

      return decision.deliverCount
    })

    revalidatePath(`/admin/requests/${requestId}`)
    revalidatePath("/admin/requests")
    revalidatePath("/admin/orders")
    return { success: true, delivered }
  } catch (error) {
    if (error instanceof OfficePickupError) return { error: error.message }
    if (error instanceof AssetTransitionError) return { error: error.message }
    throw error
  }
}

class OfficePickupError extends Error {}
