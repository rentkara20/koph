// DEV-ONLY seed: demonstrates the rental/sale split on local.db.
// Uses the real business logic (createAssetCore derives kind from the order
// line type; applyAssetTransition drives the sale lifecycle) — not raw kind
// writes. Idempotent-ish: uses a fixed order number and skips if it exists.
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, orders, orderLines, accessoryItems, accessoryStock } from "@/lib/db/schema"
import { createId } from "@/lib/utils/ids"
import { createAssetCore } from "@/lib/actions/assets"
import { applyAssetTransition } from "@/lib/actions/asset-transition"

const ORDER_NUMBER = "DEMO-SPLIT-1"
const ACTOR = "dev-seed"

const [existing] = await db.select().from(orders).where(eq(orders.orderNumber, ORDER_NUMBER))
if (existing) {
  console.log(`Order ${ORDER_NUMBER} already seeded — nothing to do.`)
  process.exit(0)
}

const customerId = createId()
const orderId = createId()
const rentalLineId = createId()
const saleLineId = createId()
const saleLineId2 = createId()

await db.transaction(async (tx) => {
  await tx.insert(customers).values({ id: customerId, name: "DEMO Split Co", city: "RUH" })
  await tx.insert(orders).values({
    id: orderId,
    orderNumber: ORDER_NUMBER,
    customerId,
    status: "confirmed",
    customerConfirmedAt: Date.now(),
  })

  // Line A: rental asset. Line B/C: sold products (one stays in_stock, one is
  // driven all the way to sold to show the sale lifecycle terminal state).
  await tx.insert(orderLines).values([
    { id: rentalLineId, orderId, type: "rental_asset", description: "Dell Latitude 5440 (rental)", quantity: 1 },
    { id: saleLineId, orderId, type: "sold_product", description: "Samsung 27\" Screen (sold, serialized)", quantity: 1 },
    { id: saleLineId2, orderId, type: "sold_product", description: "Samsung 27\" Screen (sold, delivered)", quantity: 1 },
  ])

  // Rental unit — kind derived = rental → shows on Assets page.
  await createAssetCore(
    tx,
    { orderLineId: rentalLineId, serialNumber: "DEMO-RENTAL-SN1", assetTag: "KARA-DEMO-R1" },
    ACTOR
  )

  // Sale unit #1 — kind derived = sale → shows on Products for Sale, in_stock.
  await createAssetCore(
    tx,
    { orderLineId: saleLineId, serialNumber: "DEMO-SALE-SN1", assetTag: "KARA-DEMO-S1" },
    ACTOR
  )

  // Sale unit #2 — drive the full sale lifecycle to "sold".
  const { assetId: saleUnit2 } = await createAssetCore(
    tx,
    { orderLineId: saleLineId2, serialNumber: "DEMO-SALE-SN2", assetTag: "KARA-DEMO-S2" },
    ACTOR
  )
  await applyAssetTransition(tx, saleUnit2, "assign", { customerId, byUserId: ACTOR })
  await applyAssetTransition(tx, saleUnit2, "deliver", { customerId, byUserId: ACTOR })
  await applyAssetTransition(tx, saleUnit2, "sell", { customerId, byUserId: ACTOR })

  // Non-serialized product for sale (quantity stock): USB-C chargers.
  const itemId = createId()
  await tx.insert(accessoryItems).values({
    id: itemId,
    nameEn: "USB-C Charger 65W",
    nameAr: "شاحن USB-C 65 واط",
    category: "non_serialized",
    requiresSerial: false,
  })
  await tx.insert(accessoryStock).values({
    id: createId(),
    accessoryItemId: itemId,
    location: "main_warehouse",
    qty: 10,
  })
})

console.log(`Seeded ${ORDER_NUMBER}:`)
console.log("  • 1 rental unit  (KARA-DEMO-R1) → Assets page, in_stock")
console.log("  • 1 sale unit    (KARA-DEMO-S1) → Products for Sale, in_stock")
console.log("  • 1 sale unit    (KARA-DEMO-S2) → Products for Sale, SOLD (full lifecycle)")
console.log("  • 10x USB-C Charger 65W → Products for Sale, quantity stock")
