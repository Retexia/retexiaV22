import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { config, configured } from "./config";
import { secureStorage } from "./secure-storage";

/**
 * The same Supabase project and users as retexia.com. The app talks to Supabase directly only for
 * sign-in and Realtime (live chats); everything else goes through /api/app (lib/api.ts), which
 * applies the same access rule as the web panels.
 */
export const supabase = createClient(configured ? config.supabaseUrl : "https://not-configured.invalid", configured ? config.supabaseAnonKey : "none", {
  auth: {
    storage: secureStorage,
    storageKey: "rx-auth",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in front (Supabase's advice for React Native).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
