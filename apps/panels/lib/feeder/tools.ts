/**
 * Feeder packages that have a tool in this panel (by package slug). A package
 * without one still shows in the menu; once bought it says it's being set up.
 * Add a new tool here and a component in components/feeder.
 */
export type FeederTool = "bulk-import";

export function toolFor(packageSlug: string): FeederTool | null {
  if (/bulk/.test(packageSlug)) return "bulk-import";
  return null;
}
