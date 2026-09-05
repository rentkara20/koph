import { describe, test, expect } from "vitest"
import { fitWithin, MAX_IMAGE_DIMENSION } from "./image-resize"

describe("fitWithin", () => {
  test("caps the longest edge and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
  })

  test("never upscales a photo that is already small", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(MAX_IMAGE_DIMENSION, 900)).toEqual({ width: MAX_IMAGE_DIMENSION, height: 900 })
  })

  test("handles a square and an extreme panorama", () => {
    expect(fitWithin(3000, 3000)).toEqual({ width: 1600, height: 1600 })
    expect(fitWithin(10000, 500)).toEqual({ width: 1600, height: 80 })
  })

  test("degrades to zero rather than producing a broken canvas size", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(Number.NaN, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(-10, 10)).toEqual({ width: 0, height: 0 })
  })
})
