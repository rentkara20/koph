import Link from "next/link"
import { globalSearch } from "@/lib/actions/search"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const REQUEST_STATUS_VARIANT: Record<string, "outline" | "info" | "warning" | "success" | "destructive" | "secondary"> = {
  draft: "outline",
  assigned: "info",
  in_progress: "warning",
  completed: "success",
  failed: "destructive",
  on_hold: "secondary",
  cancelled: "secondary",
}

const PARTNER_STATUS_VARIANT: Record<string, "outline" | "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "outline",
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = "" } = await searchParams
  const results = q.length >= 2 ? await globalSearch(q) : null

  const total = results
    ? results.requests.length + results.customers.length + results.partners.length
    : 0

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search results</h1>
        {q && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {results
              ? total > 0
                ? `${total} result${total !== 1 ? "s" : ""} for "${q}"`
                : `No results for "${q}"`
              : `Query too short — enter at least 2 characters`}
          </p>
        )}
      </div>

      {results && results.requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Requests ({results.requests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {results.requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/requests/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-mono font-medium">{r.requestNumber}</span>
                    {r.trackingCode && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {r.trackingCode}
                      </span>
                    )}
                    <Badge
                      variant={REQUEST_STATUS_VARIANT[r.status] ?? "outline"}
                      className="ml-auto"
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {results && results.customers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customers ({results.customers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {results.customers.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[c.mobile, c.email, c.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {results && results.partners.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Partners ({results.partners.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {results.partners.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/partners/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.mobile, p.email].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge
                      variant={PARTNER_STATUS_VARIANT[p.status] ?? "outline"}
                    >
                      {p.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!q && (
        <p className="text-sm text-muted-foreground">
          Use the search bar above to search across requests, customers, and partners.
        </p>
      )}
    </div>
  )
}
