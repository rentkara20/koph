"use server"

// Asset Documents (Milestone 2 / B4). Provider-neutral attachment metadata
// (provider/providerFileId/providerUrl/storagePath/sensitivity — see
// lib/db/schema.ts) so a future adapter (e.g. Google Drive) can plug in
// without a new schema column. Only "vercel_blob" is wired for now.
//
// The unauthenticated read/write core lives in asset-documents-core.ts (a plain
// module, NOT "use server") so it is not exposed as a public RPC endpoint. Only
// the guarded wrappers below are callable actions.
import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { attachments } from "@/lib/db/schema"
import { getSessionWithRole, getStaffSession } from "@/lib/auth/session"
import { uploadAssetDocumentCore, deleteAssetDocumentCore } from "@/lib/actions/asset-documents-core"

type ActionResult = { error?: string; id?: string }

export async function getAssetDocuments(assetId: string) {
  const session = await getStaffSession()
  if (!session) return []
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityId, assetId), eq(attachments.entityType, "asset")))
    .orderBy(desc(attachments.createdAt))
}

export async function uploadAssetDocument(formData: FormData): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  const assetId = String(formData.get("assetId") ?? "")
  const file = formData.get("file")
  const kind = String(formData.get("kind") ?? "other")
  const sensitivity = formData.get("sensitivity") === "operational" ? "operational" : "sensitive"

  if (!(file instanceof File)) return { error: "No file provided" }

  try {
    const result = await uploadAssetDocumentCore({ assetId, file, kind, sensitivity }, session.user.id)
    revalidatePath(`/admin/assets/${assetId}`)
    return { id: result.id }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to upload document" }
  }
}

export async function deleteAssetDocument(id: string): Promise<ActionResult> {
  const session = await getSessionWithRole("admin", "finance")
  if (!session) return { error: "Unauthorized" }

  try {
    const result = await deleteAssetDocumentCore(id)
    revalidatePath(`/admin/assets/${result.entityId}`)
    return { id: result.id }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete document" }
  }
}
