// Slugs the asset lifecycle (signOffTask in lib/actions/tasks.ts) branches on
// directly — changing or deactivating these changes real behavior, not just
// a label. Kept out of lib/actions/request-types.ts because "use server"
// files may only export async functions, not plain constants.
export const SYSTEM_REQUEST_TYPE_SLUGS = ["delivery", "collection", "installation", "swap"] as const
