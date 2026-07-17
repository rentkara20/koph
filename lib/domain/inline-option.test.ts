import { describe, expect, test } from "vitest"
import { addAndSelectOption } from "./inline-option"

describe("addAndSelectOption", () => {
  test("adds a newly created option and selects it without losing existing choices", () => {
    const result = addAndSelectOption([{ id: "1", name: "Existing" }], { id: "2", name: "New" })
    expect(result.options).toEqual([
      { id: "1", name: "Existing" },
      { id: "2", name: "New" },
    ])
    expect(result.selectedId).toBe("2")
  })

  test("does not duplicate an option returned twice", () => {
    const result = addAndSelectOption([{ id: "1", name: "Old" }], { id: "1", name: "Updated" })
    expect(result.options).toEqual([{ id: "1", name: "Updated" }])
  })
})
