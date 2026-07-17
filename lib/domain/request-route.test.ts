import { describe, expect, it } from "vitest"
import { buildRequestRoutePlan } from "./request-route"

const warehouse = { label: "KARA warehouse" }
const contact = {
  label: "Ahmed — Riyadh branch",
  address: "Building 3, Olaya",
  mapsLink: "https://maps.example/ahmed",
  mobile: "0500000000",
}

describe("buildRequestRoutePlan", () => {
  it("routes delivery from KARA to the selected customer contact", () => {
    expect(buildRequestRoutePlan({ typeSlug: "delivery", warehouse, contact })).toEqual({
      kind: "outbound",
      from: warehouse,
      to: contact,
      returnTo: null,
      isAutomatic: true,
    })
  })

  it("reverses the route when collecting from a person", () => {
    expect(buildRequestRoutePlan({ typeSlug: "collection", warehouse, contact })).toEqual({
      kind: "inbound",
      from: contact,
      to: warehouse,
      returnTo: null,
      isAutomatic: true,
    })
  })

  it("shows both directions for a swap", () => {
    expect(buildRequestRoutePlan({ typeSlug: "swap", warehouse, contact })).toEqual({
      kind: "swap",
      from: warehouse,
      to: contact,
      returnTo: warehouse,
      isAutomatic: true,
    })
  })

  it("keeps explicit route overrides for exceptional jobs", () => {
    expect(
      buildRequestRoutePlan({
        typeSlug: "delivery",
        warehouse,
        contact,
        originOverride: "Supplier warehouse",
        destinationOverride: "Temporary event site",
      })
    ).toMatchObject({
      from: { label: "Supplier warehouse" },
      to: { label: "Temporary event site" },
      isAutomatic: false,
    })
  })
})
