export function DetailField({
  label,
  value,
  span,
}: {
  label: string
  value: React.ReactNode
  span?: boolean
}) {
  return (
    <div className={span ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{value || "—"}</dd>
    </div>
  )
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
}
