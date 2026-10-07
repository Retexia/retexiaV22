"use client";

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookieOptions } from "./cookies";
import type { Database } from "./database.types";
import { requireSupabaseEnv } from "./env";

let client: SupabaseClient<Database> | undefined;

/** Supabase client for Client Components. One instance per browser tab. */
export function createBrowserClient(): SupabaseClient<Database> {
  if (client) return client;
  const { url, anonKey } = requireSupabaseEnv();
  client = createSsrBrowserClient<Database>(url, anonKey, { cookieOptions: cookieOptions(typeof window === "undefined" ? null : window.location.hostname) });
  return client;
}
