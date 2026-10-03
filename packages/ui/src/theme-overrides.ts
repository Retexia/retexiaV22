import { z } from "zod";
import {
  colorTokens,
  defaultTokens,
  lengthTokens,
  tokensToCss,
  type ResolvedTokens,
} from "./tokens";

/** hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba(), hsl()/hsla() only. */
const COLOR_RE =
  /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.\s,/%]+\)|hsla?\(\s*[\d.\s,/%deg]+\))$/i;
/** px or rem lengths only, e.g. 20px, 1.25rem. */
const LENGTH_RE = /^\d{1,4}(?:\.\d{1,3})?(?:px|rem)$/;

export const colorValue = z.string().trim().regex(COLOR_RE);
const lengthValue = z.string().trim().regex(LENGTH_RE);
const themedColor = z.union([
  colorValue.transform((v) => ({ light: v, dark: v })),
  z.object({ light: colorValue.optional(), dark: colorValue.optional() }),
]);

export function isColor(value: unknown): value is string {
  return colorValue.safeParse(value).success;
}

/**
 * Merge `site_settings.theme` over the default tokens. Anything that is not a
 * known token or not a valid colour/length is dropped (with a warning), so a
 * typo in Supabase can never break the site.
 */
export function resolveTheme(overrides: unknown): ResolvedTokens {
  const tokens = defaultTokens();
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return tokens;

  for (const [key, raw] of Object.entries(overrides as Record<string, unknown>)) {
    if (key in colorTokens) {
      const parsed = themedColor.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[theme] ignored invalid colour for "${key}"`);
        continue;
      }
      if (parsed.data.light) tokens.light[key] = parsed.data.light;
      if (parsed.data.dark) tokens.dark[key] = parsed.data.dark;
    } else if (key in lengthTokens) {
      const parsed = lengthValue.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[theme] ignored invalid length for "${key}"`);
        continue;
      }
      tokens.light[key] = parsed.data;
    } else {
      console.warn(`[theme] ignored unknown token "${key}"`);
    }
  }
  return tokens;
}

export type ProductColors = {
  slug: string;
  color_light: string | null;
  color_dark: string | null;
  color_soft_light: string | null;
  color_soft_dark: string | null;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** `--product-<slug>` and `--product-<slug>-soft` for every product. */
export function productColorCss(products: ProductColors[]) {
  let light = "";
  let dark = "";
  for (const p of products) {
    if (!SLUG_RE.test(p.slug)) continue;
    const pick = (v: string | null, fallback: string) => (isColor(v) ? v : fallback);
    light += `--product-${p.slug}:${pick(p.color_light, "var(--rx-brand)")};`;
    light += `--product-${p.slug}-soft:${pick(p.color_soft_light, "var(--rx-brand-soft)")};`;
    dark += `--product-${p.slug}:${pick(p.color_dark, "var(--rx-brand)")};`;
    dark += `--product-${p.slug}-soft:${pick(p.color_soft_dark, "var(--rx-brand-soft)")};`;
  }
  return { light, dark };
}

export function buildThemeCss(overrides: unknown, products: ProductColors[] = []) {
  return tokensToCss(resolveTheme(overrides), productColorCss(products));
}
