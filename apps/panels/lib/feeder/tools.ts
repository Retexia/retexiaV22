/**
 * Feeder packages that have a tool in this panel (by package slug). A package
 * without one still shows in the menu; once bought it says it's being set up.
 * Add a new tool here and a component in components/feeder.
 */
export type FeederTool = "bulk-import-v2" | "autopublish" | "auto-comment" | "lingo-feeder";

/** Bulk create v2 (customers with the older Bulk import get it too), Autopublish and Auto comment (free) and Lingo Feeder (WhatsApp assistant). */
export function toolFor(packageSlug: string): FeederTool | null {
  if (packageSlug === "autopublish") return "autopublish";
  if (packageSlug === "auto-comment") return "auto-comment";
  if (packageSlug === "lingo-feeder" || packageSlug === "lingo") return "lingo-feeder";
  return /bulk/.test(packageSlug) ? "bulk-import-v2" : null;
}
