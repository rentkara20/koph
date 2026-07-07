import Link from "next/link"
import { FileSignature } from "lucide-react"
import { getAllSignatureRequests } from "@/lib/actions/signatures"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"
import { SignatureDeleteButton } from "./_components/signature-delete-button"

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
            <>
              {/* Mobile: cards */}
              <div className="grid gap-2 p-4 sm:hidden">
                {signatures.map((sig) => (
                  <div key={sig.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-2">
                      {sig.requestId ? (
                        <Link href={`/admin/requests/${sig.requestId}`} className="font-medium">
                          {sig.documentName}
                        </Link>
                      ) : (
                        <p className="font-medium">{sig.documentName}</p>
                      )}
                      <Badge variant={STATUS_VARIANT[sig.status] ?? "outline"}>
                        {STATUS_LABEL[sig.status] ?? sig.status}
                      </Badge>
                    </div>
                    {sig.customerName && <p className="mt-1 text-sm text-muted-foreground">{sig.customerName}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        {sig.requestNumber ?? (sig.requestId ? sig.requestId.slice(0, 8) : "Standalone")}
                      </span>
                      <SignatureDeleteButton id={sig.id} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <table className="hidden w-full text-sm sm:table">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                      Document
                    </th>
                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">
                      Customer
                    </th>
                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">
                      Request
                    </th>
                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden lg:table-cell">
                      Created
                    </th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {signatures.map((sig) => (
                    <tr key={sig.id} className={`hover:bg-muted/30 transition-colors ${sig.requestId ? "relative cursor-pointer" : ""}`}>
                      <td className="px-4 py-3">
                        {sig.requestId ? (
                          <Link
                            href={`/admin/requests/${sig.requestId}`}
                            className="font-medium after:absolute after:inset-0"
                          >
                            {sig.documentName}
                          </Link>
                        ) : (
                          <p className="font-medium">{sig.documentName}</p>
                        )}
                        {sig.requireNationalId && (
                          <p className="text-xs text-muted-foreground mt-0.5">Requires ID</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {sig.customerName ?? "—"}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="font-mono text-xs text-muted-foreground">
                          {sig.requestNumber ?? (sig.requestId ? sig.requestId.slice(0, 8) : "Standalone")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[sig.status] ?? "outline"}>
                          {STATUS_LABEL[sig.status] ?? sig.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {formatDate(sig.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-end relative z-10">
                        <SignatureDeleteButton id={sig.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
