import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function WorkflowContinuationCard({
  title,
  description,
  actionLabel,
  href,
}: {
  title: string
  description: string
  actionLabel: string
  href: string
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Link href={href} className={cn(buttonVariants({ size: "default" }), "w-full gap-2 sm:w-auto")}>
        {actionLabel}
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
      </Link>
    </section>
  )
}
