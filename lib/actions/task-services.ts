"use server"

import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { partnerTasks, servicesCatalog, taskServices } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { getSession, getSessionWithRole } from "@/lib/auth/session"

export type TaskServiceResult = { error?: string; id?: string; isCompleted?: boolean }

// ─── Get services for a single task ──────────────────────────────────────────

export async function getServicesForTask(taskId: string) {
  return db
    .select({
      id: taskServices.id,
      serviceId: taskServices.serviceId,
      nameEn: servicesCatalog.nameEn,
      nameAr: servicesCatalog.nameAr,
      isCompleted: taskServices.isCompleted,
      completedAt: taskServices.completedAt,
    })
    .from(taskServices)
    .innerJoin(servicesCatalog, eq(taskServices.serviceId, servicesCatalog.id))
    .where(eq(taskServices.partnerTaskId, taskId))
    .orderBy(asc(servicesCatalog.sortOrder))
}

// ─── Get services for all tasks of a request (grouped by taskId) ──────────────

export async function getTaskServicesForRequest(requestId: string) {
  const session = await getSession()
  if (!session) return {} as Record<string, Awaited<ReturnType<typeof getServicesForTask>>>

  const rows = await db
    .select({
      id: taskServices.id,
      taskId: taskServices.partnerTaskId,
      serviceId: taskServices.serviceId,
      nameEn: servicesCatalog.nameEn,
      nameAr: servicesCatalog.nameAr,
      isCompleted: taskServices.isCompleted,
      completedAt: taskServices.completedAt,
    })
    .from(taskServices)
    .innerJoin(servicesCatalog, eq(taskServices.serviceId, servicesCatalog.id))
    .innerJoin(partnerTasks, eq(taskServices.partnerTaskId, partnerTasks.id))
    .where(eq(partnerTasks.requestId, requestId))
    .orderBy(asc(servicesCatalog.sortOrder))

  const result: Record<string, typeof rows> = {}
  for (const row of rows) {
    if (!result[row.taskId]) result[row.taskId] = []
    result[row.taskId].push(row)
  }
  return result
}

// ─── Admin: add service to a task ────────────────────────────────────────────

export async function addServiceToTask(
  taskId: string,
  serviceId: string
): Promise<TaskServiceResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [existing] = await db
    .select()
    .from(taskServices)
    .where(
      and(eq(taskServices.partnerTaskId, taskId), eq(taskServices.serviceId, serviceId))
    )

  if (existing) return { id: existing.id }

  const id = createId()
  await db.insert(taskServices).values({ id, partnerTaskId: taskId, serviceId })

  const [task] = await db.select().from(partnerTasks).where(eq(partnerTasks.id, taskId))
  if (task) revalidatePath(`/admin/requests/${task.requestId}`)

  return { id }
}

// ─── Admin: remove service from a task ───────────────────────────────────────

export async function removeServiceFromTask(
  taskServiceId: string
): Promise<TaskServiceResult> {
  const session = await getSessionWithRole("admin")
  if (!session) return { error: "Unauthorized" }

  const [ts] = await db
    .select()
    .from(taskServices)
    .where(eq(taskServices.id, taskServiceId))

  if (!ts) return { error: "Not found" }

  await db.delete(taskServices).where(eq(taskServices.id, taskServiceId))

  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.id, ts.partnerTaskId))

  if (task) revalidatePath(`/admin/requests/${task.requestId}`)
  return {}
}

// ─── Public (partner): toggle service completion via task token ───────────────

export async function toggleTaskServiceByToken(
  token: string,
  taskServiceId: string
): Promise<TaskServiceResult> {
  const [ts] = await db
    .select()
    .from(taskServices)
    .where(eq(taskServices.id, taskServiceId))

  if (!ts) return { error: "Not found" }

  const [task] = await db
    .select()
    .from(partnerTasks)
    .where(eq(partnerTasks.id, ts.partnerTaskId))

  if (!task || task.taskToken !== token) return { error: "Unauthorized" }
  if (task.status !== "in_progress") return { error: "Task is not in progress" }
  if (task.taskTokenExpiresAt < Date.now()) return { error: "Link expired" }

  const newValue = !ts.isCompleted
  await db
    .update(taskServices)
    .set({ isCompleted: newValue, completedAt: newValue ? Date.now() : null })
    .where(eq(taskServices.id, taskServiceId))

  return { isCompleted: newValue }
}
