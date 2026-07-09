// Proof-requirements resolution, extracted so it can be unit-tested without the
// DB/session. A task's required proof (signature + photo count) is resolved from
// a precedence chain of sources — most specific first — falling back to a system
// default. In v1 only the request-type and system-default sources are populated;
// the task/contract/customer slots exist so the chain can tighten later without
// changing call sites (see Master Roadmap, Phase 1 / OI-0).

export interface ProofRequirements {
  signature: boolean
  photos: number
}

// A source may specify either field or neither; an undefined field means "defer
// to the next source in the chain", NOT "false"/"zero".
export interface ProofConfig {
  signature?: boolean
  photos?: number
}

export interface ProofContext {
  // Auto-rule input: if the task recorded any damaged/missing item condition,
  // at least one photo is always required regardless of configured minimums.
  hasDamage?: boolean
}

export const SYSTEM_DEFAULT_PROOF: ProofRequirements = { signature: false, photos: 1 }

const MAX_PHOTOS = 10

// Parse the JSON stored in request_type.proof_config (nullable/free-form) into a
// safe ProofConfig. Anything malformed resolves to null so the chain falls
// through to the next source rather than throwing on bad stored data.
export function parseProofConfig(raw: string | null | undefined): ProofConfig | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    const out: ProofConfig = {}
    if (typeof obj.signature === "boolean") out.signature = obj.signature
    if (typeof obj.photos === "number" && Number.isFinite(obj.photos)) {
      out.photos = Math.min(MAX_PHOTOS, Math.max(0, Math.floor(obj.photos)))
    }
    return out
  } catch {
    return null
  }
}

// Resolve the effective requirements. `sources` are ordered most-specific first
// (task, contract, customer, request-type). The first source that defines a
// given field wins for that field; unset fields fall through to systemDefault.
export function resolveProofRequirements(
  sources: ReadonlyArray<ProofConfig | null | undefined>,
  context: ProofContext = {},
  systemDefault: ProofRequirements = SYSTEM_DEFAULT_PROOF
): ProofRequirements {
  const pick = <K extends keyof ProofRequirements>(key: K): ProofRequirements[K] => {
    for (const source of sources) {
      if (source && source[key] !== undefined) return source[key] as ProofRequirements[K]
    }
    return systemDefault[key]
  }

  const resolved: ProofRequirements = { signature: pick("signature"), photos: pick("photos") }

  // Auto-rule: damage always demands photographic evidence.
  if (context.hasDamage && resolved.photos < 1) resolved.photos = 1

  return resolved
}
