"use server"

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { communicationLog } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getStaffSession, getSessionWithRole } from "@/lib/auth/session"

// Honest manual-communication audit. Opening a channel is NOT proof of send:
// prepareCommunication records "prepared"; only an explicit admin confirmation
// moves it to "manually_confirmed_sent". The message BODY (which may carry an
// OTP) is NEVER stored — only recipient + message type.

export type CommActionResult = { error?: string; id?: string }

type Channel = "whatsapp" | "outlook" | "mailto" | "copy"

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
