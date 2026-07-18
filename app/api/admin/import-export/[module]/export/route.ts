import { getSessionWithRole } from "@/lib/auth/session"
import { buildExportCsv, isModuleKey } from "@/lib/import-export/modules"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ module: string }> }
): Promise<Response> {
  const session = await getSessionWithRole("admin")
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { module } = await params
  if (!isModuleKey(module)) return new Response("Unknown module", { status: 404 })

  const csv = await buildExportCsv(module)
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${module}-export.csv"`,
    },
  })
}
