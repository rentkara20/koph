export default function PartnerLoading() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-live="polite">
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
