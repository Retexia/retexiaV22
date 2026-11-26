/**
 * Retexia design tokens: the single source of truth for the websites and the app.
 *
 * Web: @retexia/ui turns every token into a CSS variable `--rx-<name>` (light values on `:root`,
 * dark values on `.dark`; see packages/ui/src/tokens.ts), overridable from Admin → Settings → Theme.
 * App: apps/mobile reads these objects directly (lib/theme.tsx).
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
  /** Admin and product panels only: wider work area. */
  "container-wide": "1280px",
  content: "720px",
  measure: "480px",
  gutter: "24px",
} satisfies Record<string, string>;

export type ColorToken = keyof typeof colorTokens;
export type LengthToken = keyof typeof lengthTokens;
export type TokenName = ColorToken | keyof typeof shadowTokens | LengthToken;

/** Radii as numbers (the app): sm for inputs and chips, md for cards, lg for sheets, pill for buttons. */
export const radii = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

/**
 * The type scale (theme.css @utility type-*): font family, weight, size / line height in px,
 * letter spacing in em. `large` is the size on large screens (web only).
 */
export type TypeStyle = {
  family: "display" | "text" | "mono";
  weight: 300 | 400 | 500 | 600;
  size: number;
  lineHeight: number;
  tracking?: number;
  uppercase?: boolean;
  large?: { size: number; lineHeight: number };
};
export const typeScale = {
  "display-xl": { family: "display", weight: 300, size: 36, lineHeight: 44, tracking: -0.02, large: { size: 52, lineHeight: 60 } },
  display: { family: "display", weight: 300, size: 30, lineHeight: 38, tracking: -0.015, large: { size: 36, lineHeight: 44 } },
  h1: { family: "display", weight: 400, size: 26, lineHeight: 34, tracking: -0.01 },
  h2: { family: "display", weight: 500, size: 18, lineHeight: 26 },
  h3: { family: "text", weight: 600, size: 14, lineHeight: 20 },
  "body-lg": { family: "text", weight: 400, size: 16, lineHeight: 26 },
  body: { family: "text", weight: 400, size: 14, lineHeight: 22 },
  label: { family: "text", weight: 500, size: 13, lineHeight: 20 },
  small: { family: "text", weight: 400, size: 12, lineHeight: 18 },
  eyebrow: { family: "text", weight: 500, size: 11, lineHeight: 16, tracking: 0.24, uppercase: true },
  caption: { family: "text", weight: 600, size: 11, lineHeight: 16, tracking: 0.06, uppercase: true },
  code: { family: "mono", weight: 400, size: 12, lineHeight: 18 },
} satisfies Record<string, TypeStyle>;
export type TypeName = keyof typeof typeScale;

/** Product colours as seeded (public.products; Admin can change them, /api/app/me sends the current ones). */
export const productColors = {
  lingo: { light: "#0b7565", dark: "#3fd3bc", softLight: "#d7f1ec", softDark: "#0f2f2a", icon: "message-circle" },
  post: { light: "#ad2a5e", dark: "#ff7fae", softLight: "#f8dde8", softDark: "#3a1424", icon: "calendar-clock" },
  plan: { light: "#5b3fd1", dark: "#a996ff", softLight: "#ece8fc", softDark: "#221a45", icon: "target" },
  feeder: { light: "#2a68d9", dark: "#7aaeff", softLight: "#eaf1fd", softDark: "#14254a", icon: "package" },
} as const;

/** The loading line (RetexiaLoader / ProgressLine): timing shared by the CSS and the app's animation. */
export const loaderMotion = {
  durationMs: 1400,
  /** cubic-bezier(0.65, 0, 0.35, 1) */
  easing: [0.65, 0, 0.35, 1] as const,
  segments: [
    { width: 0.4, delayMs: 0, opacity: 1 },
    { width: 0.18, delayMs: 500, opacity: 0.7 },
  ],
  /** ProgressLine: show after this long (no flicker), keep at least this long, fade out. */
  showAfterMs: 150,
  minVisibleMs: 400,
  fadeMs: 200,
} as const;
