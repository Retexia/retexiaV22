import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Supabase session storage in the phone's keystore (Android Keystore / iOS Keychain). A session
 * is larger than SecureStore likes in one value, so it is stored in chunks: <key>.n holds the
 * count, <key>.0 … <key>.n-1 the parts. On the web (dev preview only) localStorage is used.
 */
const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

const web = {
  getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage?.removeItem(key),
};

async function removeItem(key: string) {
  const k = safe(key);
  const n = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
  await Promise.all([
    ...Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`)),
    SecureStore.deleteItemAsync(`${k}.n`),
  ]);
}

const native = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key);
    const n = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)));
    return parts.some((p) => p == null) ? null : parts.join("");
  },
  async setItem(key: string, value: string) {
    const k = safe(key);
    await removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${k}.${i}`, p)));
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
  },
  removeItem,
};

export const secureStorage = Platform.OS === "web" ? web : native;
