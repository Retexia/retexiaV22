/** Build-time settings (EXPO_PUBLIC_* are inlined by Expo; see app.config.ts and .env.example). */
const strip = (s: string) => s.replace(/\/+$/, "");

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** apps/panels, which serves /api/app/*. */
  apiUrl: strip(process.env.EXPO_PUBLIC_API_URL || "https://feeder.retexia.com"),
  /** retexia.com: forgot password, the magic-link return page, privacy policy. */
  webUrl: strip(process.env.EXPO_PUBLIC_WEB_URL || "https://www.retexia.com"),
};

export const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** Where each product's own web panel lives (shown as plain text for parts not in the app yet). */
export const PANEL_HOST: Record<string, string> = {
  lingo: "lingo.retexia.com",
  post: "post.retexia.com",
  feeder: "feeder.retexia.com",
  plan: "plan.retexia.com",
};
