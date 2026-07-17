import { describe, expect, it } from "vitest"
import {
  buildGoogleMapsLink,
  chooseDefaultCustomerLocation,
  contactsForCustomerLocation,
  groupCustomerLocationsWithContacts,
} from "./customer-location"

describe("customer location", () => {
  it("keeps the current active default", () => {
    const result = chooseDefaultCustomerLocation([
      { id: "office", isDefault: false, isActive: true },
      { id: "warehouse", isDefault: true, isActive: true },
    ])

    expect(result).toBe("warehouse")
  })

  it("promotes the first active location when no active default remains", () => {
    const result = chooseDefaultCustomerLocation([
      { id: "old", isDefault: true, isActive: false },
      { id: "office", isDefault: false, isActive: true },
      { id: "warehouse", isDefault: false, isActive: true },
    ])

    expect(result).toBe("office")
  })

  it("returns contacts linked to the selected site and keeps preferred contacts first", () => {
    const contacts = contactsForCustomerLocation(
      [
        { id: "ahmed", name: "Ahmed" },
        { id: "mona", name: "Mona" },
        { id: "sara", name: "Sara" },
      ],
      [
        { contactId: "mona", locationId: "warehouse", isPrimary: false },
        { contactId: "ahmed", locationId: "warehouse", isPrimary: true },
        { contactId: "sara", locationId: "office", isPrimary: true },
      ],
      "warehouse"
    )

    expect(contacts.map((contact) => contact.id)).toEqual(["ahmed", "mona"])
  })

  it("builds a directions-safe Google Maps link from coordinates", () => {
    expect(buildGoogleMapsLink(24.7136, 46.6753)).toBe(
      "https://www.google.com/maps/search/?api=1&query=24.7136%2C46.6753"
    )
  })

  it("groups a multi-site employee under every linked site and separates unassigned people", () => {
    const result = groupCustomerLocationsWithContacts(
      [
        { id: "office", name: "Main office" },
        { id: "warehouse", name: "Warehouse" },
      ],
      [
        { id: "ahmed", name: "Ahmed" },
        { id: "mona", name: "Mona" },
      ],
      [
        { contactId: "ahmed", locationId: "office", isPrimary: true },
        { contactId: "ahmed", locationId: "warehouse", isPrimary: false },
      ]
    )

    expect(result.groups[0].contacts.map((contact) => contact.id)).toEqual(["ahmed"])
    expect(result.groups[1].contacts.map((contact) => contact.id)).toEqual(["ahmed"])
    expect(result.unassignedContacts.map((contact) => contact.id)).toEqual(["mona"])
  })
})
