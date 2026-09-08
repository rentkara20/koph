// A sticker is permanent hardware. The checks here are the last gate before a
// serial becomes a QR code that can never be reissued — a duplicate, an
// over-long serial, or a mis-packed bitmap all become physical waste.
import { describe, expect, test } from "vitest"
import {
  LABEL_H,
  LABEL_W,
  MAX_SERIAL_LEN,
  packGfa,
  resolveHeaders,
  serialKey,
  validateRows,
  ZPL_HEADER,
  labelZpl,
} from "./label-studio"
import { normaliseSerial } from "./device-portal"
import {
  checkLabelSize,
  DEFAULT_PROFILE_ID,
  getProfile,
  labelDots,
  PRINTER_PROFILES,
  zplHeader,
} from "./printer-profiles"

describe("printed geometry is the measured printer, not a preference", () => {
  test("50×25 mm at 203 dpi", () => {
    expect(LABEL_W).toBe(400)
    expect(LABEL_H).toBe(200)
  })

  test("header carries the calibrated ribbon/gap/darkness/speed settings", () => {
    expect(ZPL_HEADER).toContain("^PW400")
    expect(ZPL_HEADER).toContain("^LL200")
    expect(ZPL_HEADER).toContain("^MTT") // thermal transfer (ribbon)
    expect(ZPL_HEADER).toContain("^MNY") // gap sensing
    expect(ZPL_HEADER).toContain("^MD10")
    expect(ZPL_HEADER).toContain("^PR2")
  })
})

describe("the serial in the URL and the serial in the sticker agree", () => {
  test("serialKey matches the portal's normaliser exactly", () => {
    // If these two ever diverge, every sticker printed in between is dead.
    for (const raw of ["KR-000123", "kr 000123", "C02XY1234ABC", "359345643190859", "a_b-c 1"]) {
      expect(serialKey(raw)).toBe(normaliseSerial(raw))
    }
  })

  test("separators are stripped and case is raised", () => {
    expect(serialKey("kr-000 123")).toBe("KR000123")
  })
})

describe("upload headers", () => {
  test("accepts English, Arabic, and KOPH export spellings", () => {
    expect(resolveHeaders(["Serial", "Brand", "Model", "Type"])).toEqual({
      serialNumber: "Serial",
      brand: "Brand",
      model: "Model",
      deviceType: "Type",
    })
    expect(resolveHeaders(["الرقم التسلسلي", "الماركة", "الموديل"])).toMatchObject({
      serialNumber: "الرقم التسلسلي",
      brand: "الماركة",
      model: "الموديل",
    })
    expect(resolveHeaders(["serial_number", "device_type"])).toMatchObject({
      serialNumber: "serial_number",
      deviceType: "device_type",
    })
  })

  test("a file with no serial column resolves to null rather than guessing", () => {
    expect(resolveHeaders(["Name", "Price"]).serialNumber).toBeNull()
  })
})

describe("validation refuses what would waste stock", () => {
  const headers = ["Serial", "Model"]
  const rows = (...serials: string[]) => serials.map((s) => ({ Serial: s, Model: "iPad" }))

  test("a clean file passes with row numbers matching the spreadsheet", () => {
    const out = validateRows(rows("AAA111", "BBB222"), headers, new Set())
    expect(out.map((r) => r.issues)).toEqual([[], []])
    expect(out.map((r) => r.rowNumber)).toEqual([2, 3])
  })

  test("a serial repeated inside the file is flagged once, not twice", () => {
    const out = validateRows(rows("AAA111", "aaa-111"), headers, new Set())
    expect(out[0].issues).toEqual([])
    expect(out[1].issues).toContain("duplicate_in_file")
  })

  test("a serial that already has an identity is refused", () => {
    // This is the check that stops one device owning two QR codes.
    const out = validateRows(rows("HK56KK4N66"), headers, new Set(["HK56KK4N66"]))
    expect(out[0].issues).toContain("already_exists")
  })

  test("an over-long serial is refused rather than printed clipped", () => {
    const out = validateRows(rows("A".repeat(MAX_SERIAL_LEN + 1)), headers, new Set())
    expect(out[0].issues).toContain("too_long")
  })

  test("blank and punctuation-only serials are refused", () => {
    const out = validateRows(rows("", "---"), headers, new Set())
    expect(out[0].issues).toContain("empty")
    expect(out[1].issues).toContain("no_alnum")
  })

  test("missing optional columns are empty strings, not undefined", () => {
    const out = validateRows([{ Serial: "AAA111" }], ["Serial"], new Set())
    expect(out[0]).toMatchObject({ brand: "", model: "", deviceType: "" })
  })
})

describe("GFA packing", () => {
  test("rows are padded to whole bytes — an unpadded row shears the image", () => {
    // 9 px wide needs 2 bytes per row, not 9/8.
    const mono = new Uint8Array(9 * 2)
    const gfa = packGfa(mono, 9, 2)
    expect(gfa.startsWith("^GFA,4,4,2,")).toBe(true)
  })

  test("a set pixel becomes the high bit of its byte", () => {
    const mono = new Uint8Array(8)
    mono[0] = 1
    expect(packGfa(mono, 8, 1)).toBe("^GFA,1,1,1,80")
  })

  test("the last pixel of a byte becomes the low bit", () => {
    const mono = new Uint8Array(8)
    mono[7] = 1
    expect(packGfa(mono, 8, 1)).toBe("^GFA,1,1,1,01")
  })

  test("an all-black label is all FF and sized to the real label", () => {
    const mono = new Uint8Array(LABEL_W * LABEL_H).fill(1)
    const gfa = packGfa(mono, LABEL_W, LABEL_H)
    const expectedBytes = (LABEL_W / 8) * LABEL_H
    expect(gfa.startsWith(`^GFA,${expectedBytes},${expectedBytes},${LABEL_W / 8},`)).toBe(true)
    expect(gfa.endsWith("FF")).toBe(true)
  })
})

describe("printer profiles follow the vendor dot table, not a guess", () => {
  const size = { widthMm: 50, heightMm: 25 }

  test("the Honeywell PC42E-T is the default and is 203 dpi at 8 dots/mm", () => {
    const p = getProfile(DEFAULT_PROFILE_ID)
    expect(p.id).toBe("honeywell_pc42e_203")
    expect(p.dpi).toBe(203)
    expect(p.dotsPerMm).toBe(8)
  })

  test("mm × 8 reproduces the datasheet conversion table exactly", () => {
    const p = getProfile(DEFAULT_PROFILE_ID)
    const table: Array<[number, number]> = [
      [20, 160],
      [25, 200],
      [30, 240],
      [40, 320],
      [50, 400],
      [60, 480],
      [70, 560],
      [80, 640],
      [100, 800],
      [108, 864],
    ]
    for (const [mm, dots] of table) {
      expect(labelDots(p, { widthMm: mm, heightMm: mm }).width).toBe(dots)
    }
  })

  test("50×25 mm is 400×200 dots — the constants the design was verified at", () => {
    expect(labelDots(getProfile(DEFAULT_PROFILE_ID), size)).toEqual({
      width: LABEL_W,
      height: LABEL_H,
    })
  })

  test("an unknown profile id falls back rather than producing a zero-size label", () => {
    expect(labelDots(getProfile("nonsense"), size)).toEqual({ width: 400, height: 200 })
  })

  test("no profile claims 300 dpi", () => {
    for (const p of PRINTER_PROFILES) expect(p.dpi).toBe(203)
  })

  test("a size wider than the printhead is refused before anything is generated", () => {
    const p = getProfile("honeywell_pc42e_203")
    expect(checkLabelSize(p, { widthMm: 110, heightMm: 25 })).toContain("wider_than_head")
    // 108 mm is the documented maximum and must still be allowed.
    expect(checkLabelSize(p, { widthMm: 108, heightMm: 25 })).toEqual([])
  })

  test("stock below the printer's media minimums is refused", () => {
    const p = getProfile("honeywell_pc42e_203")
    expect(checkLabelSize(p, { widthMm: 20, heightMm: 25 })).toContain("too_narrow")
    expect(checkLabelSize(p, { widthMm: 50, heightMm: 8 })).toContain("too_short")
  })

  test("the ZPL envelope carries the entered size and the profile's burn settings", () => {
    const header = zplHeader(getProfile("honeywell_pc42e_203"), { widthMm: 70, heightMm: 30 })
    expect(header).toContain("^PW560")
    expect(header).toContain("^LL240")
    expect(header).toContain("^PR4") // datasheet default speed
    expect(header).toContain("^MD10")
    // Zebra keeps its own measured speed.
    expect(zplHeader(getProfile("zebra_gk420t_203"), size)).toContain("^PR2")
  })

  test("labelZpl wraps the bitmap in the selected profile and size", () => {
    const mono = new Uint8Array(8)
    expect(labelZpl(mono, 8, 1, "honeywell_pc42e_203", { widthMm: 100, heightMm: 25 })).toContain(
      "^PW800"
    )
    expect(labelZpl(mono, 8, 1)).toContain("^PW400")
  })

  test("every uncalibrated profile says why, so nobody prints a batch on a guess", () => {
    for (const p of PRINTER_PROFILES) {
      if (!p.calibrated) expect(p.notes.length).toBeGreaterThan(10)
    }
  })
})
