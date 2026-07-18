import { describe, expect, it } from "vitest"
import { parseCsv, toCsv } from "./csv"
import type { ColumnDef } from "./types"

describe("parseCsv", () => {
  it("parses header + rows and trims whitespace", () => {
    const csv = "name,mobile\n  Acme ,  0501234567 \nGlobex,0509999999\n"
    const { headers, rows } = parseCsv(csv)
    expect(headers).toEqual(["name", "mobile"])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: "Acme", mobile: "0501234567" })
  })

  it("skips empty lines", () => {
    const csv = "name\nAcme\n\n\nGlobex\n"
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(2)
  })
})

describe("toCsv", () => {
  const columns: ColumnDef[] = [
    { header: "Name", field: "name", required: true },
    { header: "Mobile", field: "mobile", required: false },
  ]

  it("produces a header-only template when no rows are given", () => {
    const csv = toCsv(columns, [])
    expect(csv.trim()).toBe("Name,Mobile")
  })

  it("renders data rows under the configured headers", () => {
    const csv = toCsv(columns, [{ name: "Acme", mobile: "0501234567" }])
    const lines = csv.trim().split("\r\n")
    expect(lines[0]).toBe("Name,Mobile")
    expect(lines[1]).toBe("Acme,0501234567")
  })

  it("renders missing values as empty cells", () => {
    const csv = toCsv(columns, [{ name: "Acme" }])
    const lines = csv.trim().split("\r\n")
    expect(lines[1]).toBe("Acme,")
  })
})
