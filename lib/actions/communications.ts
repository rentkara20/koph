"use server"

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { communicationLog } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"
import { isEmailEnabled, sendEmail } from "@/lib/email/resend"
import { rfqEmail } from "@/lib/email/templates"

// Honest manual-communication audit. Opening a channel is NOT proof of send:
// prepareCommunication records "prepared"; only an explicit admin confirmation
// moves it to "manually_confirmed_sent". The message BODY (which may carry an
// OTP) is NEVER stored — only recipient + message type.

export type CommActionResult = { error?: string; id?: string }

type Channel = "whatsapp" | "email" | "outlook" | "mailto" | "copy"

export async function prepareCommunication(input: {
  entityType: string
  entityId: string
  channel: Channel
  messageType: string
  recipient?: string | null
  revalidate?: string
}): Promise<CommActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const id = createId()
  const now = Date.now()
  await db.insert(communicationLog).values({
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    channel: input.channel,
    messageType: input.messageType,
    recipient: input.recipient ?? null,
    status: "prepared",
    preparedBy: session.user.id,
    preparedAt: now,
    updatedAt: now,
  })

  if (input.revalidate) revalidatePath(input.revalidate)
  return { id }
}

export async function confirmCommunicationSent(
  id: string,
  revalidate?: string
): Promise<CommActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const now = Date.now()
  await db
    .update(communicationLog)
    .set({ status: "manually_confirmed_sent", confirmedAt: now, updatedAt: now })
    .where(and(eq(communicationLog.id, id), eq(communicationLog.status, "prepared")))

  if (revalidate) revalidatePath(revalidate)
  return { id }
}

export async function cancelCommunication(
  id: string,
  revalidate?: string
): Promise<CommActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const now = Date.now()
  await db
    .update(communicationLog)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(communicationLog.id, id), eq(communicationLog.status, "prepared")))

  if (revalidate) revalidatePath(revalidate)
  return { id }
}

export async function getCommunicationLog(entityType: string, entityId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select()
    .from(communicationLog)
    .where(and(eq(communicationLog.entityType, entityType), eq(communicationLog.entityId, entityId)))
    .orderBy(desc(communicationLog.preparedAt))
}

export async function canSendEmailFromKoph(): Promise<boolean> {
  const session = await getStaffSession()
  return Boolean(session && isEmailEnabled())
}

export async function sendSupplierRfqEmail(input: {
  sourcingRequestId: string
  recipient: string
  subject: string
  body: string
}): Promise<CommActionResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }
  if (!isEmailEnabled()) return { error: "Email sending is not configured" }
  if (!/^\S+@\S+\.\S+$/.test(input.recipient)) return { error: "Invalid email address" }
  if (!input.subject.trim() || !input.body.trim()) return { error: "Email subject and body are required" }
  if (input.subject.length > 200 || input.body.length > 10000) return { error: "Email is too long" }

  const sent = await sendEmail({
    to: input.recipient,
    subject: input.subject.trim(),
    html: rfqEmail({ body: input.body.trim() }),
  })
  if (!sent) return { error: "Email could not be sent" }

  const id = createId()
  const now = Date.now()
  await db.insert(communicationLog).values({
    id,
    entityType: "sourcing_request",
    entityId: input.sourcingRequestId,
    channel: "email",
    messageType: "supplier_rfq",
    recipient: input.recipient,
    status: "manually_confirmed_sent",
    preparedBy: session.user.id,
    preparedAt: now,
    confirmedAt: now,
    updatedAt: now,
  })
  revalidatePath(`/admin/sourcing/${input.sourcingRequestId}`)
  return { id }
}
