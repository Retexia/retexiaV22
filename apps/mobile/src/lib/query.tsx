import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import type { ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { ApiError } from "./api";

/**
 * Server data in the app: TanStack Query, kept on the phone (AsyncStorage) for a day so the last
 * chats, orders and numbers show at once and without a connection. Cleared on sign-out.
 */
const DAY = 24 * 3600_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY,
      networkMode: "offlineFirst",
      // Don't retry what won't change (signed out, not on the account, not found).
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
    mutations: { networkMode: "online" },
  },
});

// Refetch when the app comes back to the front.
focusManager.setEventListener((handleFocus) => {
  if (Platform.OS === "web") return undefined;
  const sub = AppState.addEventListener("change", (s) => handleFocus(s === "active"));
  return () => sub.remove();
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "rx-query-cache", throttleTime: 1000 });

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: DAY, buster: Constants.expoConfig?.version ?? "1" }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/** Sign-out: forget everything that belonged to the account. */
export async function clearCache() {
  queryClient.clear();
  await persister.removeClient();
}
