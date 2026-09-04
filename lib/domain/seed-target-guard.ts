// Which databases a QA fixture is allowed to write to.
//
// This is a pure function with its own tests, not an inline check, because the
// first version of it was wrong in a way that mattered: it refused URLs
// containing "koph-prod" or "koph-production" — a blocklist of names I had
// guessed. The production database name is not visible from this machine (the
// Turso URL is a sensitive Vercel variable the CLI will not decrypt), so if
// production is simply named "koph", that blocklist would have waved it
// through and a QA signature would have landed in the table whose entire job
// is proof.
//
// So the rule is inverted: a REMOTE database must positively identify itself
// as a non-production environment. Anything that does not is refused, whatever
// it is called. Unknown means no.

const SAFE_REMOTE_MARKERS = ["preview", "staging", "qa", "test", "sandbox", "dev"]

export type SeedTargetVerdict = { ok: true; reason: string } | { ok: false; reason: string }

export function checkSeedTarget(rawUrl: string | undefined | null): SeedTargetVerdict {
  const url = (rawUrl ?? "").trim()
  if (!url) {
    return { ok: false, reason: "no database URL given" }
  }

  // Local files cannot be production: production is Turso-hosted, and a file
  // lives only on this machine.
  if (url.startsWith("file:")) {
    return { ok: true, reason: "local file database" }
  }

  const lower = url.toLowerCase()

  // An explicit production marker is refused even if a safe marker is also
  // present, so "koph-prod-preview" does not sneak through.
  if (/prod/.test(lower)) {
    return { ok: false, reason: "URL contains 'prod'" }
  }

  const marker = SAFE_REMOTE_MARKERS.find((m) => lower.includes(m))
  if (!marker) {
    return {
      ok: false,
      reason:
        "remote database does not identify itself as a non-production environment (expected one of: " +
        SAFE_REMOTE_MARKERS.join(", ") +
        ")",
    }
  }

  return { ok: true, reason: `remote database marked '${marker}'` }
}

/** Throws unless the target is provably not production. */
export function assertSafeSeedTarget(rawUrl: string | undefined | null): void {
  const verdict = checkSeedTarget(rawUrl)
  if (!verdict.ok) {
    throw new Error(
      `Refusing to seed fixture data: ${verdict.reason}. QA rows never go to production.`
    )
  }
}
