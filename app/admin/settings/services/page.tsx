import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getServices } from "@/lib/actions/services"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { ServicesManager } from "./_components/services-manager"
import { cn } from "@/lib/utils"

export default async function ServicesPage() {
  const services = await getServices()

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {services.length} service{services.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            All services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ServicesManager services={services} />
        </CardContent>
      </Card>
    </div>
  )
}
