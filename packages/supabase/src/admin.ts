import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { requireSupabaseEnv } from "./env";

/**
 * Service-role Supabase client. Bypasses RLS: use it ONLY in apps/admin server
 * code, ONLY after requireRole(), and log what it does to audit_logs. Used for
 * the Auth admin API (invite, ban, delete, reset links), svc_* functions
 * (secrets) and n8n calls. Never import it in apps/web or client code.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const { url } = requireSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (apps/admin only, server-side).");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
