import { z } from "zod"
import { getSessionWithRole } from "@/lib/auth/session"
import { commitImport, isModuleKey } from "@/lib/import-export/modules"

const commitSchema = z.object({ batchId: z.string().trim().min(1).max(60) })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
): Promise<Response> {
  const session = await getSessionWithRole("admin")
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { module } = await params
  if (!isModuleKey(module)) return Response.json({ error: "Unknown module" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = commitSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "batchId is required" }, { status: 400 })

  try {
    const summary = await commitImport(module, parsed.data.batchId, session.user.id)
    return Response.json(summary)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Commit failed" },
      { status: 400 }
    )
  }
}
