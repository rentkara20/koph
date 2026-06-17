/**
 * Run with: npx tsx lib/db/seed.ts
 * Seeds request types and initial consent version.
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { createId } from "@paralleldrive/cuid2"

async function seed() {
  const { db } = await import("./index")
  const { requestTypes, consentVersions } = await import("./schema")

  console.log("Seeding request types…")

  await db
    .insert(requestTypes)
    .values([
      { id: createId(), slug: "delivery", nameEn: "Delivery", nameAr: "توصيل", sortOrder: 1 },
      { id: createId(), slug: "collection", nameEn: "Collection", nameAr: "استلام", sortOrder: 2 },
      { id: createId(), slug: "swap", nameEn: "Swap", nameAr: "استبدال", sortOrder: 3 },
      { id: createId(), slug: "installation", nameEn: "Installation", nameAr: "تركيب", sortOrder: 4 },
      { id: createId(), slug: "maintenance", nameEn: "Maintenance", nameAr: "صيانة", sortOrder: 5 },
      { id: createId(), slug: "inspection", nameEn: "Inspection", nameAr: "فحص", sortOrder: 6 },
    ])
    .onConflictDoNothing()

  console.log("Seeding consent version 1.0…")

  await db
    .insert(consentVersions)
    .values({
      id: createId(),
      version: "1.0",
      textEn:
        "I confirm that the information I have provided is accurate and complete. I understand that my National ID / Iqama number and signature will be stored securely and used solely for the purpose of verifying this transaction in accordance with applicable data protection regulations.",
      textAr:
        "أؤكد أن المعلومات التي قدمتها دقيقة وكاملة. أفهم أن رقم هويتي الوطنية / الإقامة وتوقيعي سيتم تخزينهما بشكل آمن واستخدامهما فقط لأغراض التحقق من هذه المعاملة وفقاً للوائح حماية البيانات المعمول بها.",
      isActive: true,
    })
    .onConflictDoNothing()

  console.log("Done.")
}

seed().catch(console.error)
