import { getTranslations } from "next-intl/server"
import { searchCustomers, getCustomerById } from "@/lib/actions/customers"
import { getOrderById } from "@/lib/actions/orders"
import { CreateSourcingRequestForm } from "../_components/create-sourcing-request-form"

export default async function NewSourcingRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>
}) {
  const [{ orderId }, t, initialCustomers] = await Promise.all([
    searchParams,
    getTranslations("sourcing"),
    // Seed list shown when the customer picker first opens. Not a hard cap —
    // typing runs a fresh server-side search.
    searchCustomers(),
  ])

  // Preselect from ?orderId=… by loading the order (and its customer) directly
  // by id, so the pair resolves even when it falls outside the seed/search page.
  const initialOrder = orderId ? await getOrderById(orderId) : null
  const initialCustomer = initialOrder ? await getCustomerById(initialOrder.customerId) : null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("newRequest")}</h1>
      <CreateSourcingRequestForm
        initialCustomers={initialCustomers}
        initialCustomer={initialCustomer}
        initialOrder={initialOrder}
      />
    </div>
  )
}
