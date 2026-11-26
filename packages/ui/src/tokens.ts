/**
 * Retexia design tokens as CSS. The values are in @retexia/shared/tokens (the single source of
 * truth, also read by the app).
 *
 * Every token becomes a CSS variable `--rx-<name>` (light values on `:root`,
 * dark values on `.dark`). Tailwind utilities read those variables (see
 * theme.css), so a token can be overridden at runtime from
 * `site_settings.theme` without rebuilding.
 *
 * `tokens.css` is generated from this file (`pnpm --filter @retexia/ui tokens`)
 * so apps that do not render <ThemeStyle /> still get the defaults.
 */

import { colorTokens, lengthTokens, shadowTokens } from "@retexia/shared/tokens";

// The values live in @retexia/shared (shared with the Retexia app); this file makes CSS of them.
export { colorTokens, lengthTokens, shadowTokens, type ColorToken, type LengthToken, type ThemedValue, type TokenName } from "@retexia/shared/tokens";

export const cssVar = (name: string) => `--rx-${name}`;

/** Light/dark pairs after overrides are applied. */
export type ResolvedTokens = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

export function defaultTokens(): ResolvedTokens {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const [name, v] of Object.entries({ ...colorTokens, ...shadowTokens })) {
    light[name] = v.light;
    dark[name] = v.dark;
  }
  for (const [name, v] of Object.entries(lengthTokens)) {
    light[name] = v;
  }
  return { light, dark };
}

/** Serialise tokens into `:root{…}` and `.dark{…}` CSS. */
export function tokensToCss(tokens: ResolvedTokens, extra?: { light?: string; dark?: string }) {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k.startsWith("--") ? k : cssVar(k)}:${v};`)
      .join("");
  const light = block(tokens.light) + (extra?.light ?? "");
  const dark = block(tokens.dark) + (extra?.dark ?? "");
  return `:root{${light}color-scheme:light;}.dark{${dark}color-scheme:dark;}`;
}
