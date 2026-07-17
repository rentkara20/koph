import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { RequestWorkspace } from "@/lib/actions/request-workspace"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils/format"
import { CustomerConfirmationCard } from "@/components/request-workspace/customer-confirmation-card"

// Overview: customer + contacts, requested lines with a fulfillment bar per
// line (requested / in stock / delivered — derived), rental terms, notes.
export async function OverviewTab({ workspace }: { workspace: RequestWorkspace }) {
  const [t, tOrders] = await Promise.all([
    getTranslations("workspace"),
    getTranslations("orders"),
  ])
  const { order, customer, contacts, lines } = workspace

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {!order.customerConfirmedAt && order.status === "draft" && (
          <CustomerConfirmationCard orderId={order.id} />
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tOrders("lines")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noLines")}</p>
            ) : (
              lines.map((line) => {
                const stocked = Math.min(line.unitCount, line.quantity)
                const delivered = Math.min(line.deliveredCount, line.quantity)
                return (
                  <div key={line.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium">
                        {line.description}
                        {(line.brand || line.model) && (
                          <span className="text-muted-foreground">
                            {" — "}
                            {[line.brand, line.model].filter(Boolean).join(" ")}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("lineFulfillment", {
                          delivered,
                          stocked,
                          requested: line.quantity,
                        })}
                      </p>
                    </div>
                    <div
                      className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={delivered}
                      aria-valuemax={line.quantity}
                    >
                      <span
                        className="bg-green-500"
                        style={{ width: `${(delivered / line.quantity) * 100}%` }}
                      />
                      <span
                        className="bg-kara-purple/50"
                        style={{ width: `${(Math.max(stocked - delivered, 0) / line.quantity) * 100}%` }}
                      />
                    </div>
                    {line.notes && (
                      <p className="mt-2 text-xs text-muted-foreground">{line.notes}</p>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {order.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("notes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{order.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tOrders("customer")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {customer ? (
              <>
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="font-medium hover:underline"
                >
                  {customer.name}
                </Link>
                {order.contactPerson && <p>{order.contactPerson}</p>}
                {order.contactMobile && (
                  <p className="text-muted-foreground" dir="ltr">
                    {order.contactMobile}
                  </p>
                )}
                {order.contactEmail && (
                  <p className="text-muted-foreground" dir="ltr">
                    {order.contactEmail}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {contacts.length > 0 && (
              <div className="border-t pt-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("contacts")}</p>
                <ul className="space-y-1">
                  {contacts.map((c) => (
                    <li key={c.id} className="text-xs text-muted-foreground">
                      {c.name}
                      {c.role ? ` · ${c.role}` : ""}
                      {c.isAuthorizedSignatory ? ` · ${t("authorizedSignatory")}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rentalTerms")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tOrders("quoteDate")}</span>
              <span>{order.quoteDate ? formatDate(order.quoteDate) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tOrders("customerConfirmationDate")}</span>
              <span>{order.customerConfirmedAt ? formatDate(order.customerConfirmedAt) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("rentalMonths")}</span>
              <span>{order.rentalPeriodMonths ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("rentalEnd")}</span>
              <span>{workspace.rentalEndAt ? formatDate(workspace.rentalEndAt) : "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
