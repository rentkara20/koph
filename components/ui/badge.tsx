import { cn } from "@/lib/utils"

type Variant = "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "outline"

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-muted text-muted-foreground",
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  outline: "border border-border text-foreground bg-transparent",
}

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: {
  variant?: Variant
  className?: string
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export const requestStatusVariant: Record<string, Variant> = {
  draft: "outline",
  assigned: "info",
  in_progress: "warning",
  completed: "success",
  failed: "destructive",
  on_hold: "warning",
  cancelled: "secondary",
  rescheduled: "secondary",
}
