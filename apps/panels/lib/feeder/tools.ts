/**
 * Feeder packages that have a tool in this panel (by package slug). A package
 * without one still shows in the menu; once bought it says it's being set up.
 * Add a new tool here and a component in components/feeder.
 */
export type FeederTool = "bulk-import-v2" | "autopublish" | "lingo";

/** Bulk create v2 (customers with the older Bulk import get it too), Autopublish (free) and Lingo (WhatsApp bot). */
export function toolFor(packageSlug: string): FeederTool | null {
  if (packageSlug === "autopublish") return "autopublish";
  if (packageSlug === "lingo") return "lingo";
  return /bulk/.test(packageSlug) ? "bulk-import-v2" : null;
}
