import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCustomer, deleteCustomer } from "@/lib/actions/customers"
import { getCustomerContacts } from "@/lib/actions/customer-contacts"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerEditForm } from "./_components/customer-edit-form"
import { CustomerView } from "./_components/customer-view"
import { ContactsSection } from "./_components/contacts-section"
import { DeleteButton } from "@/components/delete-button"
import { EditableSection } from "@/components/editable-section"
import { PortalLinkButton } from "./_components/portal-link-button"
import { cn } from "@/lib/utils"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [customer, contacts] = await Promise.all([
    getCustomer(id),
    getCustomerContacts(id),
  ])

  if (!customer) notFound()

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/customers"
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
          <CardTitle className="text-base">Contacts &amp; Branches</CardTitle>
          <p className="text-sm text-muted-foreground">
            Employees or branch locations that can receive orders. Partners see these when assigned a task.
          </p>
        </CardHeader>
        <CardContent>
          <ContactsSection customerId={id} initialContacts={contacts} />
        </CardContent>
      </Card>
    </div>
  )
}
