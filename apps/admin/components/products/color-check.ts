import { AA_TEXT, contrastRatio, hueDistance } from "@retexia/ui/admin";

export type ProductColors = { color_light: string; color_dark: string; color_soft_light: string; color_soft_dark: string };

const BRAND = "#2a68d9";
export const SURFACE_LIGHT = "#ffffff";
export const SURFACE_DARK = "#0c1322";

/** Contrast and distinctness problems for a product colour set. */
export function colorWarnings(c: ProductColors, others: { name: string; color_light: string }[]) {
  const warnings: string[] = [];
  const check = (fg: string, bg: string, what: string) => {
    const r = contrastRatio(fg, bg);
    if (r === null) warnings.push(`${what}: enter a colour like #0b7565.`);
    else if (r < AA_TEXT) warnings.push(`${what}: contrast ${r.toFixed(2)}:1, needs ${AA_TEXT}:1.`);
  };
  check(c.color_light, SURFACE_LIGHT, "Light colour on white");
  check(c.color_light, c.color_soft_light, "Light colour on its soft background");
  check(c.color_dark, SURFACE_DARK, "Dark colour on the dark background");
  check(c.color_dark, c.color_soft_dark, "Dark colour on its soft background");
  const fromBrand = hueDistance(c.color_light, BRAND);
  if (fromBrand !== null && fromBrand < 20) warnings.push(`Very close to the brand blue (${Math.round(fromBrand)}° apart). Pick a clearly different hue.`);
  for (const o of others) {
    const d = hueDistance(c.color_light, o.color_light);
    if (d !== null && d < 20) warnings.push(`Very close to ${o.name}'s colour (${Math.round(d)}° apart).`);
  }
  return warnings;
}
