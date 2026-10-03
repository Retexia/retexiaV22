/**
 * Retexia design tokens: the single source of truth.
 *
 * Every token becomes a CSS variable `--rx-<name>` (light values on `:root`,
 * dark values on `.dark`). Tailwind utilities read those variables (see
 * theme.css), so a token can be overridden at runtime from
 * `site_settings.theme` without rebuilding.
 *
 * `tokens.css` is generated from this file (`pnpm --filter @retexia/ui tokens`)
 * so apps that do not render <ThemeStyle /> still get the defaults.
 */

export type ThemedValue = { light: string; dark: string };

export const colorTokens = {
  surface: { light: "#ffffff", dark: "#0c1322" },
  "surface-raised": { light: "#ffffff", dark: "#131c30" },
  "surface-sunk": { light: "#f4f7fc", dark: "#090e1a" },
  line: { light: "#e4ebf5", dark: "#232f48" },
  "line-strong": { light: "#7d8dab", dark: "#6e7d9c" },
  ink: { light: "#16264a", dark: "#e7edf9" },
  "ink-muted": { light: "#5a6884", dark: "#9daac3" },
  brand: { light: "#2a68d9", dark: "#7aaeff" },
  "brand-hover": { light: "#1f55b8", dark: "#a1c5ff" },
  "brand-soft": { light: "#eaf1fd", dark: "#14254a" },
  "brand-halo": { light: "#dbe7fb", dark: "#16274a" },
  "on-brand": { light: "#ffffff", dark: "#0c1322" },
  link: { light: "#2a68d9", dark: "#7aaeff" },
  success: { light: "#1d7338", dark: "#5fd38a" },
  "success-soft": { light: "#dcf2e3", dark: "#11301c" },
  warning: { light: "#855600", dark: "#f2c14e" },
  "warning-soft": { light: "#fbebc8", dark: "#33270a" },
  danger: { light: "#b42318", dark: "#ff8a80" },
  "danger-soft": { light: "#fde2df", dark: "#3b1512" },
  "on-danger": { light: "#ffffff", dark: "#0c1322" },
} satisfies Record<string, ThemedValue>;

export const shadowTokens = {
  "shadow-sm": {
    light: "0 1px 2px #16264a0a, 0 10px 30px -12px #2a68d926",
    dark: "0 1px 2px #00000066, 0 10px 30px -12px #00000099",
  },
  "shadow-lg": {
    light: "0 30px 60px -20px #2a68d940, 0 6px 16px -6px #16264a14",
    dark: "0 30px 60px -20px #000000cc, 0 6px 16px -6px #00000080",
  },
  "focus-ring": {
    light: "0 0 0 2px #ffffff, 0 0 0 4px #2a68d9",
    dark: "0 0 0 2px #0c1322, 0 0 0 4px #7aaeff",
  },
} satisfies Record<string, ThemedValue>;

export const lengthTokens = {
  "radius-sm": "6px",
  "radius-md": "12px",
  "radius-lg": "20px",
  container: "1040px",
  content: "720px",
  measure: "480px",
  gutter: "24px",
} satisfies Record<string, string>;

export type ColorToken = keyof typeof colorTokens;
export type LengthToken = keyof typeof lengthTokens;
export type TokenName = ColorToken | keyof typeof shadowTokens | LengthToken;

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
