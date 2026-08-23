import { describe, expect, it } from "vitest"
import { matchAllocationLine, type AllocatableLine } from "./asset-allocation"

const rental = (id: string, description: string): AllocatableLine => ({ id, description, type: "rental_asset" })

describe("matchAllocationLine", () => {
  it("matches a line by exact description", () => {
    const lines = [rental("a", "Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB"), rental("b", "Apple iPad 10th Gen")]
    expect(matchAllocationLine("Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB", lines)).toBe("a")
  })

  it("ignores case and spacing differences between quotes", () => {
    const lines = [rental("a", "Apple iPad A16, Wi-Fi,  11-inch, Storage 128GB"), rental("b", "Apple iPad 10th Gen")]
    expect(matchAllocationLine("apple ipad a16, wi-fi, 11-inch, storage 128gb", lines)).toBe("a")
  })

  it("matches when one description is a prefixed variant of the other", () => {
    const lines = [rental("a", "Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB"), rental("b", "Apple iPad 10th Gen")]
    // The same device is named without the brand on the older order.
    expect(matchAllocationLine("iPad A16, Wi-Fi, 11-inch, Storage 128GB", lines)).toBe("a")
  })

  // Refusing to guess is a valid answer: the allocation is then recorded at
  // order level, which is accurate, instead of at a line it may not belong to.
  it("refuses to match a line whose name does not describe the device", () => {
    const lines = [rental("a", "Whatever the quote called it")]
    expect(matchAllocationLine("Apple iPad A16", lines)).toBeNull()
  })

  it("refuses to guess between two plausible lines", () => {
    const lines = [rental("a", "Apple iPad A16, Storage 128GB"), rental("b", "Apple iPad A16, Storage 256GB")]
    expect(matchAllocationLine("Apple iPad A16", lines)).toBeNull()
  })

  it("never matches a sold_product line", () => {
    const lines: AllocatableLine[] = [
      { id: "a", description: "Apple iPad A16", type: "sold_product" },
    ]
    expect(matchAllocationLine("Apple iPad A16", lines)).toBeNull()
  })

  it("returns null for a missing description", () => {
    expect(matchAllocationLine(null, [rental("a", "Apple iPad A16")])).toBeNull()
  })
})

// Real pairs taken from production: the same device named differently on two
// orders. Neither string contains the other, so substring matching failed on all
// of them and left every device allocated at order level with no line.
describe("matchAllocationLine on real-world naming drift", () => {
  it("matches across a brand prefix and a mid-string spec", () => {
    const lines = [
      rental("a16", "Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB"),
      rental("gen10", "Apple iPad 10th Gen, Wi-Fi, 10.9 inch, Storage 64GB"),
    ]
    expect(matchAllocationLine("iPad A16, Wi-fi, Storage 128GB", lines)).toBe("a16")
    expect(matchAllocationLine("iPad 10th Gen, Wi-Fi, Storage 64GB", lines)).toBe("gen10")
  })

  it("still keeps different storage tiers apart", () => {
    const lines = [
      rental("s128", "Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB"),
      rental("s256", "Apple iPad A16, Wi-Fi, 11-inch, Storage 256GB"),
    ]
    expect(matchAllocationLine("iPad A16, Wi-Fi, Storage 128GB", lines)).toBe("s128")
    expect(matchAllocationLine("iPad A16, Wi-Fi, Storage 256GB", lines)).toBe("s256")
    // No storage given: genuinely ambiguous, so no guess.
    expect(matchAllocationLine("iPad A16, Wi-Fi", lines)).toBeNull()
  })

  it("does not match a different model family", () => {
    const lines = [rental("a16", "Apple iPad A16, Wi-Fi, 11-inch, Storage 128GB")]
    expect(matchAllocationLine("iPad Pro 11-inch, M4, Storage 256GB, Wi-Fi", lines)).toBeNull()
  })
})

describe("matchAllocationLine specificity and line kind", () => {
  // Real case: order 10685 lists every iPhone variant as its own line, and the
  // device names itself more fully than any line does.
  it("prefers the most specific compatible line", () => {
    const lines = [
      rental("plain", "iPhone 16"),
      rental("pro", "iPhone 16 Pro"),
      rental("plus", "iPhone 16 Plus"),
      rental("air", "iPhone Air"),
    ]
    expect(matchAllocationLine("iPhone 16 Pro, Storage 256GB", lines)).toBe("pro")
    expect(matchAllocationLine("iPhone 16, Storage 128GB", lines)).toBe("plain")
    expect(matchAllocationLine("iPhone 16 Plus, Storage 512GB", lines)).toBe("plus")
  })

  it("refuses when two equally specific lines both fit", () => {
    const lines = [rental("a", "iPhone 16 Pro"), rental("b", "iPhone 16 Max")]
    expect(matchAllocationLine("iPhone 16", lines)).toBeNull()
  })

  // A serialized sale unit belongs on the line the customer bought, and a rental
  // device must never land on a sold_product line.
  it("matches a sale unit against sold_product lines only", () => {
    const lines: AllocatableLine[] = [
      { id: "sold", description: "Lenovo ThinkVision T27-40 Monitor 27-Inch", type: "sold_product" },
      { id: "rent", description: "iPad A16, Wi-Fi, Storage 128GB", type: "rental_asset" },
    ]
    expect(matchAllocationLine("Lenovo ThinkVision T27-40 Monitor 27-Inch", lines, "sale")).toBe("sold")
    // The same device asked for as a rental finds nothing — correct refusal.
    expect(matchAllocationLine("Lenovo ThinkVision T27-40 Monitor 27-Inch", lines, "rental")).toBeNull()
  })

  it("keeps a rental device off a sold_product line", () => {
    const lines: AllocatableLine[] = [
      { id: "sold", description: "iPad A16, Wi-Fi, Storage 128GB", type: "sold_product" },
    ]
    expect(matchAllocationLine("iPad A16, Wi-Fi, Storage 128GB", lines, "rental")).toBeNull()
  })
})
