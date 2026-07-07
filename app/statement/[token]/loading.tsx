export default function StatementLoading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6" aria-busy="true" aria-live="polite">
      <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-lg border bg-muted/40" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted/60" />
        ))}
      </div>
    </div>
  )
}
