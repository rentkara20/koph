import Link from "next/link"
import { FileSignature } from "lucide-react"
import { getAllSignatureRequests } from "@/lib/actions/signatures"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"

type StatusVariant = "outline" | "info" | "success" | "secondary"

const STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: "outline",
  sent: "info",
  opened: "info",
  otp_verified: "info",
  signed: "success",
  rejected: "secondary",
  expired: "secondary",
  cancelled: "secondary",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  opened: "Opened",
  otp_verified: "OTP Verified",
  signed: "Signed",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
}

export default async function SignaturesPage() {
  const signatures = await getAllSignatureRequests()

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signatures</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All e-signature requests — create from a request detail page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            All signature requests ({signatures.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {signatures.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <FileSignature className="h-8 w-8" />
              <p className="text-sm">No signature requests yet.</p>
              <p className="text-xs">Open a request and use the Signature requests section.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    Document
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">
                    Customer
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">
                    Request
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {signatures.map((sig) => (
                  <tr key={sig.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{sig.documentName}</p>
                      {sig.requireNationalId && (
                        <p className="text-xs text-muted-foreground mt-0.5">Requires ID</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {sig.customerName ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {sig.requestId ? (
                        <Link
                          href={`/admin/requests/${sig.requestId}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {sig.requestNumber ?? sig.requestId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">Standalone</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[sig.status] ?? "outline"}>
                        {STATUS_LABEL[sig.status] ?? sig.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {formatDate(sig.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
