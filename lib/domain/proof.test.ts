import { describe, test, expect } from "vitest"
import {
  parseProofConfig,
  resolveProofRequirements,
  SYSTEM_DEFAULT_PROOF,
  type ProofConfig,
} from "./proof"

describe("resolveProofRequirements", () => {
  test("falls back to system default when no source defines anything", () => {
    const result = resolveProofRequirements([null, undefined, {}])
    expect(result).toEqual(SYSTEM_DEFAULT_PROOF)
  })

  test("most-specific source wins per field", () => {
    const task: ProofConfig = { signature: true }
    const requestType: ProofConfig = { signature: false, photos: 3 }
    const result = resolveProofRequirements([task, requestType])
    // signature from task (most specific), photos from request-type
    expect(result).toEqual({ signature: true, photos: 3 })
  })

  test("a false value still counts as defined and wins over later sources", () => {
    const result = resolveProofRequirements([{ signature: false }, { signature: true }])
    expect(result.signature).toBe(false)
  })

  test("undefined fields defer to the next source, not to false/zero", () => {
    const result = resolveProofRequirements([{}, { signature: true, photos: 2 }])
    expect(result).toEqual({ signature: true, photos: 2 })
  })

  test("damage auto-rule forces at least one photo", () => {
    const result = resolveProofRequirements([{ photos: 0 }], { hasDamage: true })
    expect(result.photos).toBe(1)
  })

  test("damage auto-rule does not lower an already-higher photo requirement", () => {
    const result = resolveProofRequirements([{ photos: 4 }], { hasDamage: true })
    expect(result.photos).toBe(4)
  })

  test("custom system default is used when sources are empty", () => {
    const result = resolveProofRequirements([], {}, { signature: true, photos: 5 })
    expect(result).toEqual({ signature: true, photos: 5 })
  })
})

describe("parseProofConfig", () => {
  test("null/empty input returns null (chain falls through)", () => {
    expect(parseProofConfig(null)).toBeNull()
    expect(parseProofConfig("")).toBeNull()
    expect(parseProofConfig(undefined)).toBeNull()
  })

  test("malformed JSON returns null instead of throwing", () => {
    expect(parseProofConfig("{not json")).toBeNull()
    expect(parseProofConfig("42")).toBeNull()
  })

  test("extracts valid signature + photos", () => {
    expect(parseProofConfig('{"signature":true,"photos":2}')).toEqual({ signature: true, photos: 2 })
  })

  test("ignores wrong-typed fields, keeps valid ones", () => {
    expect(parseProofConfig('{"signature":"yes","photos":3}')).toEqual({ photos: 3 })
  })

  test("clamps photos to 0..10 and floors floats", () => {
    expect(parseProofConfig('{"photos":99}')).toEqual({ photos: 10 })
    expect(parseProofConfig('{"photos":-4}')).toEqual({ photos: 0 })
    expect(parseProofConfig('{"photos":2.7}')).toEqual({ photos: 2 })
  })
})
