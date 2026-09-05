import { describe, test, expect } from "vitest"
import { normalizeDigits, digitsOnly, normalizeMobile } from "./digits"

describe("normalizeDigits", () => {
  test("folds Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("١٢٣٤٥")).toBe("12345")
    expect(normalizeDigits("٠٥٤٤٥٥")).toBe("054455")
  })

  test("folds Eastern Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("۱۲۳۴۵")).toBe("12345")
    expect(normalizeDigits("۰۹۸۷۶۵")).toBe("098765")
  })

  test("leaves ASCII digits and other characters alone", () => {
    expect(normalizeDigits("0500000000")).toBe("0500000000")
    expect(normalizeDigits("+966 50 123")).toBe("+966 50 123")
    expect(normalizeDigits("")).toBe("")
  })

  test("handles a mix of both scripts in one value", () => {
    expect(normalizeDigits("05٠١2۳")).toBe("050123")
  })
})

describe("digitsOnly", () => {
  test("normalises then strips everything that is not a digit", () => {
    expect(digitsOnly("١٢٣٤-٥٦")).toBe("123456")
    expect(digitsOnly(" 24 546 134 ")).toBe("24546134")
  })

  // The bug this was written for: \d does not match Arabic-Indic digits, so a
  // plain strip erased the whole value instead of converting it.
  test("does not erase an all-Arabic-Indic value", () => {
    expect(digitsOnly("٥٤٥٦٤٦١٨٤٥")).toBe("5456461845")
    expect("٥٤٥٦٤٦١٨٤٥".replace(/\D/g, "")).toBe("")
  })
})

describe("normalizeMobile", () => {
  test("converts an Arabic-Indic number into a dialable one", () => {
    expect(normalizeMobile("٠٥٤٥٦٤٦١٨٤٥")).toBe("05456461845")
  })

  test("keeps a leading plus for international numbers", () => {
    expect(normalizeMobile("+٩٦٦٥٠١٢٣٤٥٦٧")).toBe("+966501234567")
  })

  test("drops separators", () => {
    expect(normalizeMobile("050 123-4567")).toBe("0501234567")
    expect(normalizeMobile("(050) 1234567")).toBe("0501234567")
  })

  test("does not invent a plus that was not typed", () => {
    expect(normalizeMobile("966501234567")).toBe("966501234567")
  })
})
