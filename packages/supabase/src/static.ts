import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Anonymous Supabase client with no cookies, for public content. Safe to use
 * inside cached functions, so marketing pages can be statically rendered.
 * Returns null when Supabase is not configured (e.g. a build without env vars).
 */
export function createStaticClient(): SupabaseClient<Database> | null {
  const { url, anonKey, configured } = supabaseEnv();
  if (!configured) return null;
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
