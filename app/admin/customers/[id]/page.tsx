import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCustomer, deleteCustomer } from "@/lib/actions/customers"
import { getCustomerContacts } from "@/lib/actions/customer-contacts"
import { getCustomerContactLocationLinks, getCustomerLocations } from "@/lib/actions/customer-locations"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerEditForm } from "./_components/customer-edit-form"
import { CustomerView } from "./_components/customer-view"
import { CustomerLocationsPeopleSection } from "./_components/customer-locations-people-section"
import { DeleteButton } from "@/components/delete-button"
import { EditableSection } from "@/components/editable-section"
import { PortalLinkButton } from "./_components/portal-link-button"
import { cn } from "@/lib/utils"
import { resolveAdminReturnPath } from "@/lib/domain/admin-return-path"

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string; assignToRequestId?: string }>
}) {
  const { id } = await params
  const { returnTo, assignToRequestId } = await searchParams
  const backHref = resolveAdminReturnPath(returnTo, "/admin/customers")
  const [customer, contacts, locations, contactLocationLinks] = await Promise.all([
    getCustomer(id),
    getCustomerContacts(id),
    getCustomerLocations(id),
    getCustomerContactLocationLinks(id),
  ])

  if (!customer) notFound()

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <PortalLinkButton customerId={id} />
          <DeleteButton
            onDelete={deleteCustomer.bind(null, id)}
            redirectTo="/admin/customers"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer info</CardTitle>
        </CardHeader>
        <CardContent>
          <EditableSection
            editLabel="Edit"
            view={<CustomerView customer={customer} />}
            edit={<CustomerEditForm customer={customer} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer locations &amp; people</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose the place first, then the person who receives or hands over devices there.
          </p>
        </CardHeader>
        <CardContent>
          <CustomerLocationsPeopleSection
            customerId={id}
            locations={locations}
            contacts={contacts}
            contactLocationLinks={contactLocationLinks}
            returnTo={returnTo ? backHref : undefined}
            assignToRequestId={assignToRequestId}
          />
        </CardContent>
      </Card>
    </div>
  )
}
