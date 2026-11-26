import { existsSync } from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The Retexia app. Consumption-only: people sign in and use what they already have on their
 * Retexia account; nothing is sold in the app (payments stay on retexia.com).
 *
 * Environment (EAS: eas.json "env" per build profile, or EAS → Environment variables):
 *   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY  the same Supabase project as the websites
 *   EXPO_PUBLIC_API_URL      where /api/app lives (apps/panels), default https://feeder.retexia.com
 *   EXPO_PUBLIC_WEB_URL      retexia.com (forgot password, magic-link return page)
 *   EAS_PROJECT_ID           overrides the EAS project (default: @retexiateam/retexia)
 */
// The EAS project (expo.dev → retexiateam → retexia). Not a secret: it ships inside every build.
const projectId = process.env.EAS_PROJECT_ID || "2e8a2b54-847c-407e-a118-aae6f8ebcfc6";

// Firebase for Android push: EAS builds get it from the file variable GOOGLE_SERVICES_JSON
// (expo.dev → retexia → Environment variables); local builds use ./google-services.json (not in git).
const googleServices = process.env.GOOGLE_SERVICES_JSON || (existsSync("./google-services.json") ? "./google-services.json" : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Retexia",
  slug: "retexia",
  owner: process.env.EAS_OWNER || "retexiateam",
  scheme: "retexia",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#ffffff",
  runtimeVersion: { policy: "appVersion" },
  ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
  ios: {
    bundleIdentifier: "com.retexia.app",
    supportsTablet: false,
    associatedDomains: ["applinks:www.retexia.com", "applinks:retexia.com"],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "com.retexia.app",
    ...(googleServices ? { googleServicesFile: googleServices } : {}),
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: "#ffffff",
    },
    // Magic-link sign-in comes back on https://www.retexia.com/app-auth (Android App Links,
    // verified by https://www.retexia.com/.well-known/assetlinks.json; retexia.com redirects to www).
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "www.retexia.com", pathPrefix: "/app-auth" },
          { scheme: "https", host: "retexia.com", pathPrefix: "/app-auth" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    // Nothing the app doesn't use.
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.RECORD_AUDIO",
      // No ads, no advertising ID (Play Console → App content → Advertising ID: "No").
      "com.google.android.gms.permission.AD_ID",
    ],
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-status-bar",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 96,
        backgroundColor: "#ffffff",
        dark: { image: "./assets/splash-icon-dark.png", backgroundColor: "#0c1322" },
      },
    ],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#005DE0", defaultChannel: "default" }],
    ["expo-local-authentication", { faceIDPermission: "Retexia uses Face ID to unlock the app." }],
    "expo-secure-store",
    "expo-font",
    "expo-web-browser",
    "expo-sharing",
    "expo-image",
  ],
  extra: { ...(projectId ? { eas: { projectId } } : {}) },
});
