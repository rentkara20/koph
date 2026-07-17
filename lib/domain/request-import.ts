export function buildRequestItemsFromOrderUnits(
  units: Array<{
    unitId: string
    description: string
    brand: string | null
    model: string | null
    serialNumber: string | null
  }>
) {
  return units.map((unit) => ({
    description: unit.description,
    brand: unit.brand ?? "",
    model: unit.model ?? "",
    serialNumber: unit.serialNumber ?? "",
    quantity: 1,
    accessories: "",
    notes: "",
    orderUnitId: unit.unitId,
  }))
}
