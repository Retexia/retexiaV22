import { colorTokens, productColors, radii, typeScale, type TypeName, type TypeStyle } from "@retexia/shared/tokens";
import * as SystemUI from "expo-system-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme, type TextStyle, type ViewStyle } from "react-native";
import { prefs } from "./prefs";

/**
 * The Retexia theme in the app: the same tokens as the websites (@retexia/shared/tokens), light by
 * default (like retexia.com), dark or "same as the phone" from Account → Appearance.
 */
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
export type Colors = { [K in keyof typeof colorTokens as Camel<K & string>]: string };
export type Scheme = "light" | "dark";
export type ThemeMode = Scheme | "system";

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const palette = (scheme: Scheme) =>
  Object.fromEntries(Object.entries(colorTokens).map(([k, v]) => [camel(k), v[scheme]])) as Colors;
export const PALETTES: Record<Scheme, Colors> = { light: palette("light"), dark: palette("dark") };

/** Font files loaded in app/_layout.tsx (expo-font names). */
export const FONT = {
  display: { 300: "Outfit_300Light", 400: "Outfit_400Regular", 500: "Outfit_500Medium", 600: "Outfit_500Medium" },
  text: { 300: "DMSans_400Regular", 400: "DMSans_400Regular", 500: "DMSans_500Medium", 600: "DMSans_600SemiBold" },
  mono: { 300: "DMMono_400Regular", 400: "DMMono_400Regular", 500: "DMMono_400Regular", 600: "DMMono_400Regular" },
  sinhala: { 300: "NotoSansSinhala_400Regular", 400: "NotoSansSinhala_400Regular", 500: "NotoSansSinhala_500Medium", 600: "NotoSansSinhala_500Medium" },
} as const;

/** A type style (the web's type-* utilities) as a React Native text style. */
export function typeStyle(name: TypeName, sinhala = false): TextStyle {
  const t: TypeStyle = typeScale[name];
  return {
    fontFamily: sinhala ? FONT.sinhala[t.weight] : FONT[t.family][t.weight],
    fontSize: t.size,
    // Sinhala needs a little more room for its marks above and below.
    lineHeight: sinhala ? Math.round(t.lineHeight * 1.15) : t.lineHeight,
    letterSpacing: t.tracking ? t.tracking * t.size : 0,
    textTransform: t.uppercase ? "uppercase" : "none",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  };
}

/** Soft shadow (shadow-soft): iOS shadow from the token, Android elevation. */
export function shadow(scheme: Scheme, level: "sm" | "lg" = "sm"): ViewStyle {
  if (Platform.OS === "android") return { elevation: level === "sm" ? 2 : 6 };
  return scheme === "light"
    ? { shadowColor: "#2a68d9", shadowOpacity: level === "sm" ? 0.1 : 0.2, shadowRadius: level === "sm" ? 14 : 28, shadowOffset: { width: 0, height: level === "sm" ? 6 : 16 } }
    : { shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: level === "sm" ? 14 : 28, shadowOffset: { width: 0, height: level === "sm" ? 6 : 16 } };
}

type ProductKey = keyof typeof productColors;
type Theme = {
  scheme: Scheme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  c: Colors;
  radii: typeof radii;
  /** A product's accent and soft tint for this scheme (live colours from /api/app/me win). */
  product: (key: string, live?: { light: string; dark: string; softLight: string; softDark: string } | null) => { color: string; soft: string };
};
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("light");
  useEffect(() => {
    void prefs.get("theme").then((v) => {
      if (v === "light" || v === "dark" || v === "system") setModeState(v);
    });
  }, []);
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    void prefs.set("theme", m);
  }, []);
  const scheme: Scheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const c = PALETTES[scheme];
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.surfaceSunk);
  }, [c.surfaceSunk]);
  const value = useMemo<Theme>(
    () => ({
      scheme,
      mode,
      setMode,
      c,
      radii,
      product: (key, live) => {
        const p = live ?? productColors[key as ProductKey] ?? productColors.feeder;
        return scheme === "dark" ? { color: p.dark, soft: p.softDark } : { color: p.light, soft: p.softLight };
      },
    }),
    [scheme, mode, setMode, c],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme outside ThemeProvider");
  return t;
}
