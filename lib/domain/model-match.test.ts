import { describe, expect, test } from "vitest"
import { isSameModel } from "./model-match"

describe("isSameModel", () => {
  test("ignores punctuation and word order", () => {
    expect(isSameModel("iPad Pro, 11-inch, Wi-Fi, Storage 256GB", "iPad Pro 11 inch Wi-Fi 256GB storage")).toBe(true)
  })

  test("a more specific stored name still matches the ordered one", () => {
    expect(
      isSameModel("iPad Pro 11-inch, M4, Storage 256GB, Wi-Fi", "iPad Pro, 11-inch, Wi-Fi, Storage 256GB"),
    ).toBe(true)
  })

  test("different models do not match — the order 10760 case", () => {
    expect(isSameModel("iPad Pro, 11-inch, Wi-Fi, Storage 256GB", "iPad 10th Gen, Wi-Fi, 10.9 inch, Storage 64GB")).toBe(
      false,
    )
  })

  test("a missing name never matches", () => {
    expect(isSameModel(null, "iPad Pro")).toBe(false)
    expect(isSameModel("iPad Pro", "")).toBe(false)
  })
})

describe("isSameModel — digit/letter spacing", () => {
  test("10thGen and 10th Gen are the same model", () => {
    expect(isSameModel("iPad 10thGen, Wi-Fi, Storage 64GB", "iPad 10th Gen, Wi-Fi, 10.9 inch, Storage 64GB")).toBe(true)
  })

  test("a spelled-out spec still does not match a different one", () => {
    expect(isSameModel("iPad 10thGen, Wi-Fi, Storage 64GB", "iPad 10th Gen, Wi-Fi, 10.9 inch, Storage 256GB")).toBe(false)
  })
})
