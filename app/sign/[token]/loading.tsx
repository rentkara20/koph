export default function SignLoading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-6" aria-busy="true" aria-live="polite">
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      <div className="space-y-3 rounded-lg border p-4">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
      <div className="h-11 animate-pulse rounded-md bg-muted" />
    </div>
  )
}
