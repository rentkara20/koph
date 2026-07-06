// Lightweight in-memory sliding-window rate limiter for public token actions.
// Per-instance only (serverless instances don't share state), but it still
// stops single-source brute force / scripted abuse, which is the realistic
// threat for magic-link endpoints. Swap for a shared store (Upstash/Turso)
// if cross-instance limits ever become necessary.

const WINDOW_MS = 60_000
const buckets = new Map<string, { count: number; resetAt: number }>()

const MAX_BUCKETS = 10_000

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}

/**
 * Returns true when the caller identified by `key` is within `max` calls
 * per minute, false when the limit is exceeded.
 */
export function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}
