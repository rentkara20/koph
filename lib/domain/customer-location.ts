export type LocationCandidate = {
  id: string
  isDefault: boolean
  isActive: boolean
}

export function chooseDefaultCustomerLocation(locations: LocationCandidate[]): string | null {
  return locations.find((location) => location.isActive && location.isDefault)?.id
    ?? locations.find((location) => location.isActive)?.id
    ?? null
}

type ContactCandidate = { id: string; name: string }
type ContactLocationLink = {
  contactId: string
  locationId: string
  isPrimary: boolean
}

export function contactsForCustomerLocation<T extends ContactCandidate>(
  contacts: T[],
  links: ContactLocationLink[],
  locationId: string | null
): T[] {
  if (!locationId) return contacts

  const linksForLocation = links.filter((link) => link.locationId === locationId)
  const linkByContact = new Map(linksForLocation.map((link) => [link.contactId, link]))

  return contacts
    .filter((contact) => linkByContact.has(contact.id))
    .sort((left, right) => {
      const primaryDifference = Number(linkByContact.get(right.id)?.isPrimary)
        - Number(linkByContact.get(left.id)?.isPrimary)
      return primaryDifference || left.name.localeCompare(right.name)
    })
}

export function groupCustomerLocationsWithContacts<
  L extends { id: string; name: string },
  C extends ContactCandidate,
>(locations: L[], contacts: C[], links: ContactLocationLink[]) {
  const linkedContactIds = new Set(links.map((link) => link.contactId))
  return {
    groups: locations.map((location) => ({
      location,
      contacts: contactsForCustomerLocation(contacts, links, location.id),
    })),
    unassignedContacts: contacts
      .filter((contact) => !linkedContactIds.has(contact.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
  }
}

export function buildGoogleMapsLink(latitude: number, longitude: number): string {
  const query = encodeURIComponent(`${latitude},${longitude}`)
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}
