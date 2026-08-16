"use server"

// Ad-hoc partner tasks — an operational trip (internal delivery, manual pickup,
// supplier visit, asset transfer, errand) with NO customer request or purchase
// order behind it. Fully isolated from procurement/request/financial state:
// creating one never touches inventory, PO quantities, or request status. It
// reuses the request partner lifecycle (pending → accepted → in_progress →
// pending_signoff → closed), the magic-link token, photo proof, notifications,
// and admin sign-off/payment (see signOffAdHocTask in tasks.ts).
import { and, desc, eq, gte, isNull, lt, or, sql, SQL } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { customerContacts, partnerContracts, partners, partnerTasks, requestTypes, requests } from "@/lib/db/schema"
import { createId, generateToken } from "@/lib/utils/ids"
import { parseRiyadhDate } from "@/lib/utils/format"
import { logActivity } from "@/lib/utils/activity"
import { notify } from "@/lib/utils/notify"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { getTaskTokenTtlMs } from "@/lib/actions/settings"

type ActionResult = { error?: string; id?: string; taskToken?: string }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const createAdHocSchema = z.object({
  partnerId: z.string().trim().min(1),
  adHocTitle: z.string().trim().min(1).max(200),
  adHocReason: z.enum([
    "manual_pickup",
    "internal_delivery",
    "supplier_visit",
    "asset_transfer",
    "other",
  ]),
  // Required: an ad-hoc trip is always priced by a partner contract, so admin
  // sign-off can pay the contract amount with no per-task payment decision.
  contractId: z.string().trim().min(1),
  destinationLocation: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().min(1),
  timeWindow: z.string().trim().min(1).max(120),
  photoRequired: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
})

const parseDateOnly = parseRiyadhDate

// Testable core: validates + inserts inside the caller's tx. Defense-in-depth
// alongside the DB check constraint — this path can NEVER set requestId,
// purchaseOrderId, or procurementCaseId (they are hard-coded null below).
export async function createAdHocPartnerTaskCore(
  tx: Tx,
  input: z.infer<typeof createAdHocSchema>,
  actorUserId: string | null
): Promise<{ taskId: string; taskToken: string }> {
  const d = createAdHocSchema.parse(input)

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

  const taskId = createId()
  const taskToken = generateToken()
  const taskTokenExpiresAt = Date.now() + (await getTaskTokenTtlMs())
  const scheduledAt = parseDateOnly(d.scheduledDate)
  if (scheduledAt == null) throw new Error("Invalid scheduled date")

  await tx.insert(partnerTasks).values({
    id: taskId,
    // Origin anchors are ALWAYS null for ad_hoc — enforced here and by the
    // partner_task_single_origin_chk DB constraint.
    requestId: null,
    purchaseOrderId: null,
    procurementCaseId: null,
    kind: "ad_hoc",
    adHocTitle: d.adHocTitle,
    adHocReason: d.adHocReason,
    destinationLocation: d.destinationLocation || null,
    scheduledAt,
    timeWindow: d.timeWindow || null,
    partnerId: d.partnerId,
    contractId: d.contractId,
    // Photo is optional for ad-hoc trips; admin opts in per task at creation.
    photoRequired: d.photoRequired ?? false,
    taskToken,
    taskTokenExpiresAt,
    status: "pending",
    notes: d.notes || null,
    assignedBy: actorUserId,
    assignedAt: Date.now(),
  })

  await logActivity(
    {
      entityType: "partner_task",
      entityId: taskId,
      action: "ad_hoc_task_created",
      i18nKey: "activity.adHocTaskCreated",
      performedBy: actorUserId ?? undefined,
    },
    tx
  )

  return { taskId, taskToken }
}

export async function createAdHocPartnerTask(
  input: z.infer<typeof createAdHocSchema>
): Promise<ActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const parsed = createAdHocSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  let taskId = ""
  let taskToken = ""
  try {
    await db.transaction(async (tx) => {
      const result = await createAdHocPartnerTaskCore(tx, parsed.data, session.user.id)
      taskId = result.taskId
      taskToken = result.taskToken
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create task" }
  }

  // In-app notify when the partner has a portal login (best-effort).
  try {
    const [partner] = await db
      .select({ userId: partners.userId })
      .from(partners)
      .where(eq(partners.id, parsed.data.partnerId))
    if (partner?.userId) {
      await notify({
        userId: partner.userId,
        type: "task_assigned",
        i18nKey: "notifications.adHocTaskAssigned",
        i18nData: { title: parsed.data.adHocTitle },
        linkUrl: `/task/${taskToken}`,
        entityType: "partner_task",
        entityId: taskId,
      })
    }
  } catch (error) {
    console.error("ad-hoc-partner-tasks: swallowed notification error", error)
  }

  revalidatePath("/admin/partners/tasks")
  return { id: taskId, taskToken }
}

// ─── Admin: unified task list ────────────────────────────────────────────────

export type AdminTaskKindFilter = "all" | "request" | "ad_hoc"

export async function getAdminTasks(filters: {
  kind?: AdminTaskKindFilter
  partnerId?: string
  status?: string
  date?: string
} = {}) {
  const session = await getStaffSession()
  if (!session) return []

  const conditions: SQL[] = []
  if (filters.kind === "request") conditions.push(eq(partnerTasks.kind, "request"))
  if (filters.kind === "ad_hoc") conditions.push(eq(partnerTasks.kind, "ad_hoc"))
  if (filters.partnerId) conditions.push(eq(partnerTasks.partnerId, filters.partnerId))
  if (filters.status) conditions.push(eq(partnerTasks.status, filters.status as typeof partnerTasks.status.enumValues[number]))
  const dateStart = parseDateOnly(filters.date)
  if (dateStart != null) {
    const dateEnd = dateStart + 24 * 60 * 60 * 1000
    conditions.push(
      or(
        and(gte(partnerTasks.scheduledAt, dateStart), lt(partnerTasks.scheduledAt, dateEnd)),
        and(gte(requests.deliveryDate, dateStart), lt(requests.deliveryDate, dateEnd))
      )!
    )
  }

  return db
    .select({
      id: partnerTasks.id,
      kind: partnerTasks.kind,
      status: partnerTasks.status,
      adHocTitle: partnerTasks.adHocTitle,
      adHocReason: partnerTasks.adHocReason,
      destinationLocation: partnerTasks.destinationLocation,
      scheduledAt: partnerTasks.scheduledAt,
      timeWindow: partnerTasks.timeWindow,
      taskToken: partnerTasks.taskToken,
      createdAt: partnerTasks.createdAt,
      partnerId: partnerTasks.partnerId,
      partnerName: partners.name,
      contractId: partnerTasks.contractId,
      pricingModel: partnerContracts.pricingModel,
      unitPrice: partnerContracts.unitPrice,
      requestId: partnerTasks.requestId,
      requestNumber: requests.requestNumber,
      requestDeliveryDate: requests.deliveryDate,
      requestTimeWindow: requests.timeWindow,
      requestTypeNameEn: requestTypes.nameEn,
      requestTypeNameAr: requestTypes.nameAr,
      contactName: customerContacts.name,
      contactCity: customerContacts.city,
    })
    .from(partnerTasks)
    .leftJoin(partners, eq(partnerTasks.partnerId, partners.id))
    .leftJoin(partnerContracts, eq(partnerTasks.contractId, partnerContracts.id))
    .leftJoin(requests, eq(partnerTasks.requestId, requests.id))
    .leftJoin(requestTypes, eq(partnerTasks.taskTypeId, requestTypes.id))
    .leftJoin(customerContacts, eq(partnerTasks.contactId, customerContacts.id))
    .where(conditions.length ? and(...conditions) : undefined)
    // Chronological by the date the work actually happens (ad-hoc tasks carry
    // their own scheduledAt; request tasks inherit the request delivery date).
    // createdAt is only the tiebreak — sorting by it alone scattered tasks away
    // from their date neighbours and buried ones waiting for sign-off.
    .orderBy(
      desc(sql`coalesce(${partnerTasks.scheduledAt}, ${requests.deliveryDate}, ${partnerTasks.createdAt})`),
      desc(partnerTasks.createdAt)
    )
}

export async function getTaskFilterOptions() {
  const session = await getStaffSession()
  if (!session) return { partners: [] }

  const partnerRows = await db
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(isNull(partners.deletedAt))
    .orderBy(partners.name)

  return { partners: partnerRows }
}

// The ad-hoc-only list that used to live here was superseded by getAdminTasks
// above, which serves the same page across all three kinds. Kept deleted rather
// than unused so there is one task-list query, not two that can drift.
