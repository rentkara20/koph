import { redirect } from "next/navigation"

// "Accessories" was renamed to "Products for Sale" (route /admin/products).
// Kept as a permanent redirect so existing deep links / bookmarks resolve.
export default function AccessoriesPage() {
  redirect("/admin/products")
}
