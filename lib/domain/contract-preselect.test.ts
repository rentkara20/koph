import { describe, expect, test } from "vitest"
import { orderContractsForServiceType, preselectedContractId } from "./contract-preselect"

const DELIVERY = "svc-delivery"
const INSTALL = "svc-installation"

const c = (id: string, name: string | null, serviceTypeId: string | null) => ({
  contractId: id,
  contractName: name,
  serviceTypeId,
})

// Mirrors real production data: one partner holding a delivery contract and two
// installation contracts at a different rate.
const CONTRACTS = [
  c("k3", "Software Services", INSTALL),
  c("k1", "Delivery", DELIVERY),
  c("k2", "Hardware Services", INSTALL),
]

describe("orderContractsForServiceType", () => {
  test("puts matching contracts first", () => {
    const ordered = orderContractsForServiceType(CONTRACTS, DELIVERY)
    expect(ordered.map((x) => x.contractId)).toEqual(["k1", "k2", "k3"])
  })

  test("sorts alphabetically within each group", () => {
    const ordered = orderContractsForServiceType(CONTRACTS, INSTALL)
    // Hardware before Software (both match), then the non-matching Delivery.
    expect(ordered.map((x) => x.contractName)).toEqual([
      "Hardware Services",
      "Software Services",
      "Delivery",
    ])
  })

  test("falls back to alphabetical when no service type is known", () => {
    for (const none of [null, undefined]) {
      expect(orderContractsForServiceType(CONTRACTS, none).map((x) => x.contractName)).toEqual([
        "Delivery",
        "Hardware Services",
        "Software Services",
      ])
    }
  })

  test("does not mutate the input", () => {
    const input = [...CONTRACTS]
    const before = input.map((x) => x.contractId)
    orderContractsForServiceType(input, DELIVERY)
    expect(input.map((x) => x.contractId)).toEqual(before)
  })

  test("handles an empty list and null names", () => {
    expect(orderContractsForServiceType([], DELIVERY)).toEqual([])
    const nameless = [c("a", null, null), c("b", "Zed", null)]
    expect(orderContractsForServiceType(nameless, null).map((x) => x.contractId)).toEqual(["a", "b"])
  })
})

describe("preselectedContractId", () => {
  test("preselects the top contract when it matches the service type", () => {
    const ordered = orderContractsForServiceType(CONTRACTS, DELIVERY)
    expect(preselectedContractId(ordered, DELIVERY)).toBe("k1")
  })

  test("preselects nothing when the partner has no matching contract", () => {
    const ordered = orderContractsForServiceType(CONTRACTS, "svc-maintenance")
    expect(preselectedContractId(ordered, "svc-maintenance")).toBe("")
  })

  test("preselects nothing when the service type is unknown", () => {
    const ordered = orderContractsForServiceType(CONTRACTS, null)
    expect(preselectedContractId(ordered, null)).toBe("")
    expect(preselectedContractId(ordered, undefined)).toBe("")
  })

  test("preselects nothing for a partner with no contracts", () => {
    expect(preselectedContractId([], DELIVERY)).toBe("")
  })

  test("resolves a same-service-type tie to the alphabetically first", () => {
    const ordered = orderContractsForServiceType(CONTRACTS, INSTALL)
    expect(preselectedContractId(ordered, INSTALL)).toBe("k2") // Hardware Services
  })

  test("never invents a rate: every returned id is a matching contract", () => {
    for (const svc of [DELIVERY, INSTALL, "svc-unknown", null]) {
      const ordered = orderContractsForServiceType(CONTRACTS, svc)
      const picked = preselectedContractId(ordered, svc)
      if (picked === "") continue
      expect(CONTRACTS.find((x) => x.contractId === picked)?.serviceTypeId).toBe(svc)
    }
  })
})
