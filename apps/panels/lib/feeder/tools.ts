/**
 * Feeder packages that have a tool in this panel (by package slug). A package
 * without one still shows in the menu; once bought it says it's being set up.
 * Add a new tool here and a component in components/feeder.
 */
export type FeederTool = "bulk-import" | "bulk-import-v2";

export function toolFor(packageSlug: string): FeederTool | null {
  if (/bulk/.test(packageSlug) && /v2/.test(packageSlug)) return "bulk-import-v2";
  if (/bulk/.test(packageSlug)) return "bulk-import";
  return null;
}

/** The Products Google Sheet Bulk import matches lead forms against (names, prices, item codes, aliases). */
export const PRODUCTS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mdp_tNC0aHyNQiOCrdio9HdRKjg49V7EcAfydHRUYWM/edit?usp=sharing";
