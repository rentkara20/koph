"use server"

// Supplier Pickup — a first-class Procurement capability, NOT a request type.
// A pickup task is always created FROM a purchase order (which anchors it to
// its procurement case and supplier); there is no standalone creation path.
// The partner flow is pending → accepted → arrived → picked_up; the partner
// can never complete the procurement — warehouse receipt
// (receivePurchaseOrderLineCore + tryClosePickupTaskCore) closes the task.
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  attachments,
  partnerContracts,
  partners,
  partnerTasks,
  pickupTaskLines,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
} from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { logActivity } from "@/lib/utils/activity"
import { notify } from "@/lib/utils/notify"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { getRequiredDeliveryPhotoCount, getTaskTokenTtlMs } from "@/lib/actions/settings"
import { emitDomainEvent } from "@/lib/actions/domain-events"
import { canTransition } from "@/lib/domain/task-status"
import { OPEN_PICKUP_TASK_STATUSES } from "@/lib/domain/procurement-fulfilment"
import { checkRateLimit } from "@/lib/utils/rate-limit"

type ActionResult = { error?: string; id?: string; taskToken?: string }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const OPEN_STATUSES = [...OPEN_PICKUP_TASK_STATUSES]

// ─── Create a pickup task (only from a PO) ────────────────────────────────────

const createPickupTaskSchema = z.object({
  purchaseOrderId: z.string().trim().min(1),
  partnerId: z.string().trim().min(1),
  contractId: z.string().trim().min(1).optional(),
  destinationLocation: z.string().trim().max(200).optional(),
  photoRequired: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().trim().min(1),
        qtyPlanned: z.number().int().min(1),
      })
    )
    .min(1),
})

export async function createPickupTaskCore(
  tx: Tx,
  input: z.infer<typeof createPickupTaskSchema>,
  actorUserId: string | null
): Promise<{ taskId: string; taskToken: string }> {
  const d = createPickupTaskSchema.parse(input)

  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, d.purchaseOrderId))
  if (!po) throw new Error("Purchase order not found")
  if (po.status !== "ordered" && po.status !== "partially_received") {
    throw new Error("Pickup tasks can only be created for an open purchase order")
  }
  if (!po.readyForPickupAt) {
    throw new Error("Mark the purchase order ready for pickup first")
  }

  const [partner] = await tx.select().from(partners).where(eq(partners.id, d.partnerId))
  if (!partner || partner.deletedAt) throw new Error("Partner not found")
  if (d.contractId) {
    const [contract] = await tx
      .select({ id: partnerContracts.id, partnerId: partnerContracts.partnerId })
      .from(partnerContracts)
      .where(eq(partnerContracts.id, d.contractId))
    if (!contract || contract.partnerId !== d.partnerId) {
      throw new Error("Contract does not belong to this partner")
    }
  }

  // Guard: each planned line belongs to this PO, is active, and the total
  // planned across still-open pickup tasks never exceeds what remains
  // uncollected (qtyOrdered − qtyPickedUp). All inside the tx.
  const lineIds = d.lines.map((l) => l.purchaseOrderLineId)
  if (new Set(lineIds).size !== lineIds.length) throw new Error("Duplicate line in pickup plan")
  const poLines = await tx
    .select()
    .from(purchaseOrderLines)
    .where(inArray(purchaseOrderLines.id, lineIds))
  const byId = new Map(poLines.map((l) => [l.id, l]))

  const openTaskRows = await tx
    .select({ id: partnerTasks.id })
    .from(partnerTasks)
    .where(
      and(
        eq(partnerTasks.purchaseOrderId, d.purchaseOrderId),
        inArray(partnerTasks.status, OPEN_STATUSES)
      )
    )
  const openTaskIds = openTaskRows.map((t) => t.id)
  const openPlanned = openTaskIds.length
    ? await tx
        .select({
          purchaseOrderLineId: pickupTaskLines.purchaseOrderLineId,
          planned: sql<number>`sum(${pickupTaskLines.qtyPlanned})`,
        })
        .from(pickupTaskLines)
        .where(inArray(pickupTaskLines.pickupTaskId, openTaskIds))
        .groupBy(pickupTaskLines.purchaseOrderLineId)
    : []
  const openPlannedByLine = new Map(openPlanned.map((r) => [r.purchaseOrderLineId, Number(r.planned)]))

  for (const planned of d.lines) {
    const line = byId.get(planned.purchaseOrderLineId)
    if (!line || line.purchaseOrderId !== d.purchaseOrderId) {
      throw new Error("Line does not belong to this purchase order")
    }
    if (line.status === "cancelled") throw new Error("Cannot plan a cancelled line")
    const alreadyPlanned = openPlannedByLine.get(line.id) ?? 0
    const plannable = line.qtyOrdered - line.qtyPickedUp - alreadyPlanned
    if (planned.qtyPlanned > plannable) {
      throw new Error(
        `Only ${Math.max(0, plannable)} unit(s) of "${line.itemDescription}" remain plannable`
      )
    }
  }

  const taskId = createId()
  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + (await getTaskTokenTtlMs())

  await tx.insert(partnerTasks).values({
    id: taskId,
    requestId: null,
    procurementCaseId: po.procurementCaseId,
    purchaseOrderId: po.id,
    kind: "supplier_pickup",
    destinationLocation: d.destinationLocation || "main_warehouse",
    partnerId: d.partnerId,
    contractId: d.contractId || null,
    photoRequired: d.photoRequired ?? true,
    taskToken,
    taskTokenExpiresAt,
    status: "pending",
    notes: d.notes || null,
    assignedBy: actorUserId,
    assignedAt: Date.now(),
  })

  for (const planned of d.lines) {
    await tx.insert(pickupTaskLines).values({
      id: createId(),
      pickupTaskId: taskId,
      purchaseOrderLineId: planned.purchaseOrderLineId,
      qtyPlanned: planned.qtyPlanned,
    })
  }

  await emitDomainEvent(tx, {
    aggregateType: "task",
    aggregateId: taskId,
    eventType: "PickupTaskCreated",
    payload: {
      purchaseOrderId: po.id,
      procurementCaseId: po.procurementCaseId,
      partnerId: d.partnerId,
      lineCount: d.lines.length,
      totalPlanned: d.lines.reduce((s, l) => s + l.qtyPlanned, 0),
    },
    dedupeKey: `task:${taskId}:PickupTaskCreated`,
    actorUserId,
  })

  await logActivity(
    {
      entityType: "purchase_order",
      entityId: po.id,
      action: "pickup_task_created",
      i18nKey: "activity.pickupTaskCreated",
      performedBy: actorUserId ?? undefined,
    },
    tx
  )

  return { taskId, taskToken }
}

export async function createPickupTask(
  input: z.infer<typeof createPickupTaskSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const parsed = createPickupTaskSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let taskId = ""
  let taskToken = ""
  try {
    await db.transaction(async (tx) => {
      const result = await createPickupTaskCore(tx, parsed.data, session.user.id)
      taskId = result.taskId
      taskToken = result.taskToken
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create pickup task" }
  }

  // In-app notify when the partner has a portal login (best-effort).
  try {
    const [partner] = await db
      .select({ userId: partners.userId })
      .from(partners)
      .where(eq(partners.id, parsed.data.partnerId))
    if (partner?.userId) {
      const [po] = await db
        .select({ poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, parsed.data.purchaseOrderId))
      await notify({
        userId: partner.userId,
        type: "task_assigned",
        i18nKey: "notifications.pickupTaskAssigned",
        i18nData: { poNumber: po?.poNumber ?? "" },
        linkUrl: `/task/${taskToken}`,
        entityType: "partner_task",
        entityId: taskId,
      })
    }
  } catch (error) {
    console.error("procurement-pickup: swallowed notification error", error)
  }

  revalidatePath(`/admin/procurement/${parsed.data.purchaseOrderId}`)
  return { id: taskId, taskToken }
}

// ─── Partner (token-gated): pickup context for the magic-link page ──────────

export async function getPickupTaskByToken(token: string) {
  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.taskToken, token))
  if (!task || task.kind !== "supplier_pickup" || !task.purchaseOrderId) return null

  const [[po], [partner], taskLines] = await Promise.all([
    db.select().from(purchaseOrders).where(eq(purchaseOrders.id, task.purchaseOrderId)),
    db.select().from(partners).where(eq(partners.id, task.partnerId)),
    db.select().from(pickupTaskLines).where(eq(pickupTaskLines.pickupTaskId, task.id)),
  ])
  if (!po) return null

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId))
  const poLines = taskLines.length
    ? await db
        .select()
        .from(purchaseOrderLines)
        .where(
          inArray(
            purchaseOrderLines.id,
            taskLines.map((l) => l.purchaseOrderLineId)
          )
        )
    : []

  return {
    task,
    po: { id: po.id, poNumber: po.poNumber },
    supplier: supplier ?? null,
    partner: partner ?? null,
    lines: taskLines.map((tl) => ({
      ...tl,
      poLine: poLines.find((pl) => pl.id === tl.purchaseOrderLineId) ?? null,
    })),
    isExpired: task.taskTokenExpiresAt < Date.now(),
  }
}

// ─── Partner (token-gated): confirm collection with quantities ──────────────
// The quantity-carrying replacement for a generic mark_done: records how many
// units of each planned line were actually collected (partial allowed) and
// pushes those counters onto the PO lines with guarded increments. After this
// the task is "picked_up" (= in transit) and ONLY warehouse receipt closes it.

// Testable core: status CAS + per-line quantity writes + guarded PO-line
// increments + event, all in the caller's tx. `expectedStatus` is the status
// the caller validated against (CAS guard).
export async function collectPickupCore(
  tx: Tx,
  taskId: string,
  expectedStatus: string,
  entries: { pickupTaskLineId: string; qtyPickedUp: number }[]
): Promise<{ total: number }> {
  const [task] = await tx.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (!task || task.kind !== "supplier_pickup" || !task.purchaseOrderId) {
    throw new Error("Pickup task not found")
  }

  const taskLines = await tx
    .select()
    .from(pickupTaskLines)
    .where(eq(pickupTaskLines.pickupTaskId, taskId))
  const byId = new Map(taskLines.map((l) => [l.id, l]))

  for (const entry of entries) {
    const tl = byId.get(entry.pickupTaskLineId)
    if (!tl) throw new Error("Line does not belong to this pickup task")
    if (entry.qtyPickedUp < 0 || !Number.isInteger(entry.qtyPickedUp)) throw new Error("Invalid quantity")
    if (entry.qtyPickedUp > tl.qtyPlanned) {
      throw new Error("Cannot collect more than planned for a line")
    }
  }
  const submittedIds = new Set(entries.map((l) => l.pickupTaskLineId))
  if (submittedIds.size !== entries.length) throw new Error("Duplicate line")
  if (taskLines.some((tl) => !submittedIds.has(tl.id))) {
    throw new Error("Every planned line needs a collected quantity (0 allowed)")
  }
  const total = entries.reduce((s, l) => s + l.qtyPickedUp, 0)
  if (total === 0) throw new Error("Nothing collected — mark the task failed instead")

  // Status CAS first: two tabs racing the same link must not both write quantities.
  const statusResult = await tx
    .update(partnerTasks)
    .set({ status: "picked_up", pickedUpAt: Date.now(), updatedAt: Date.now() })
    .where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.status, expectedStatus as typeof task.status)))
  if (((statusResult as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
    throw new Error("TASK_STATUS_CHANGED")
  }

  for (const entry of entries) {
    if (entry.qtyPickedUp === 0) continue
    const tl = byId.get(entry.pickupTaskLineId)!

    const taskLineResult = await tx
      .update(pickupTaskLines)
      .set({ qtyPickedUp: entry.qtyPickedUp, updatedAt: Date.now() })
      .where(and(eq(pickupTaskLines.id, tl.id), eq(pickupTaskLines.qtyPickedUp, 0)))
    if (((taskLineResult as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
      throw new Error("TASK_STATUS_CHANGED")
    }

    // Guarded increment on the PO line: never exceed qtyOrdered even if an
    // admin re-planned concurrently.
    const poLineResult = await tx
      .update(purchaseOrderLines)
      .set({
        qtyPickedUp: sql`${purchaseOrderLines.qtyPickedUp} + ${entry.qtyPickedUp}`,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(purchaseOrderLines.id, tl.purchaseOrderLineId),
          sql`${purchaseOrderLines.qtyPickedUp} + ${entry.qtyPickedUp} <= ${purchaseOrderLines.qtyOrdered}`
        )
      )
    if (((poLineResult as { rowsAffected?: number }).rowsAffected ?? 0) === 0) {
      throw new Error("Collected quantity exceeds what remains on the purchase order")
    }
  }

  await emitDomainEvent(tx, {
    aggregateType: "task",
    aggregateId: taskId,
    eventType: "PickupTaskPickedUp",
    payload: { purchaseOrderId: task.purchaseOrderId, totalCollected: total },
    dedupeKey: `task:${taskId}:PickupTaskPickedUp`,
  })

  await logActivity(
    {
      entityType: "purchase_order",
      entityId: task.purchaseOrderId,
      action: "pickup_collected",
      i18nKey: "activity.pickupCollected",
      i18nData: { quantity: String(total) },
      performedAs: "partner_link",
    },
    tx
  )

  return { total }
}

const collectSchema = z.object({
  lines: z
    .array(
      z.object({
        pickupTaskLineId: z.string().trim().min(1),
        qtyPickedUp: z.number().int().min(0),
      })
    )
    .min(1),
})

export async function markPickupCollectedByToken(
  token: string,
  input: z.infer<typeof collectSchema>
): Promise<ActionResult> {
  if (!checkRateLimit(`task-update:${token}`, 20)) {
    return { error: "Too many attempts. Please wait a minute and try again." }
  }
  const parsed = collectSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.taskToken, token))
  if (!task || task.kind !== "supplier_pickup") return { error: "Task not found" }
  if (task.taskTokenExpiresAt < Date.now()) return { error: "Link expired" }
  if (!canTransition(task.status, "mark_picked_up", "supplier_pickup")) {
    return { error: "Invalid action for current task status" }
  }

  // Proof photos, same rule as delivery mark_done.
  if (task.photoRequired) {
    const requiredPhotos = Math.max(1, await getRequiredDeliveryPhotoCount())
    const [{ value: photoCount }] = await db
      .select({ value: count() })
      .from(attachments)
      .where(and(eq(attachments.entityId, task.id), eq(attachments.entityType, "partner_task")))
    if (photoCount < requiredPhotos) return { error: "PHOTO_REQUIRED" }
  }

  try {
    await db.transaction(async (tx) => {
      await collectPickupCore(tx, task.id, task.status, parsed.data.lines)
    })
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_STATUS_CHANGED") {
      return { error: "Task status changed. Please refresh and try again." }
    }
    return { error: error instanceof Error ? error.message : "Failed to record collection" }
  }

  revalidatePath(`/task/${token}`)
  if (task.purchaseOrderId) revalidatePath(`/admin/procurement/${task.purchaseOrderId}`)
  return { id: task.id }
}

// ─── Admin: in-transit pickup tasks (warehouse receiving worklist) ──────────

export async function getInTransitPickupTasks() {
  const session = await getStaffSession()
  if (!session) return []
  const tasks = await db
    .select({
      id: partnerTasks.id,
      status: partnerTasks.status,
      pickedUpAt: partnerTasks.pickedUpAt,
      destinationLocation: partnerTasks.destinationLocation,
      purchaseOrderId: partnerTasks.purchaseOrderId,
      poNumber: purchaseOrders.poNumber,
      supplierName: suppliers.name,
      partnerName: partners.name,
    })
    .from(partnerTasks)
    .leftJoin(purchaseOrders, eq(partnerTasks.purchaseOrderId, purchaseOrders.id))
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .where(and(eq(partnerTasks.kind, "supplier_pickup"), eq(partnerTasks.status, "picked_up")))
    .orderBy(partnerTasks.pickedUpAt)
  return tasks
}
