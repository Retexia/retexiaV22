import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LingoDatabase } from "./db.types";

export type LingoDb = SupabaseClient<LingoDatabase, "lingo">;
let client: LingoDb | null = null;

/**
 * Service-role client for the "lingo" schema of the Retexia project. Server
 * code only. It bypasses RLS: every query MUST filter by the signed-in owner's
 * lingo_user_id (see requireLingo() in lib/lingo/session.ts).
 */
export function lingoDb(): LingoDb {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (apps/panels, server-side).");
  client = createClient<LingoDatabase, "lingo">(url, key, {
    db: { schema: "lingo" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Owner-safe columns of lingo_users (never the Evolution API key). */
export const TENANT_COLUMNS = "id, owner_id, business_name, evolution_instance, owner_phone, staff_name, default_language, content_language, followup_hours, delivery_days, active, created_at";
