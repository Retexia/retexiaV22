import { buildThemeCss, type ProductColors } from "./theme-overrides";

/**
 * Emits one <style> with every design token for light (:root) and dark (.dark),
 * merged with validated overrides from `site_settings.theme` and the product
 * colours (`--product-<slug>`, `--product-<slug>-soft`).
 */
export function ThemeStyle({
  overrides,
  products = [],
}: {
  overrides?: unknown;
  products?: ProductColors[];
}) {
  const css = buildThemeCss(overrides, products);
  return <style id="rx-theme" dangerouslySetInnerHTML={{ __html: css }} />;
}
