import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCustomer, deleteCustomer } from "@/lib/actions/customers"
import { getCustomerContacts } from "@/lib/actions/customer-contacts"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerEditForm } from "./_components/customer-edit-form"
import { ContactsSection } from "./_components/contacts-section"
import { DeleteButton } from "@/components/delete-button"
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
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        </div>
        <DeleteButton
          onDelete={deleteCustomer.bind(null, id)}
          redirectTo="/admin/customers"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerEditForm customer={customer} />
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
