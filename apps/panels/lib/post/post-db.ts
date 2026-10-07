import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostDatabase } from "./post-db.types";

export type PostDb = SupabaseClient<PostDatabase, "post">;

let client: PostDb | null = null;

/**
 * Service-role client for the "post" schema of the Retexia project. Server
 * code only. It bypasses RLS, so every query MUST be scoped to the signed-in
 * owner's business (see requireBusiness() in lib/post/session.ts).
 */
export function postDb(): PostDb {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (apps/panels, server-side).");
  client = createClient<PostDatabase, "post">(url, key, {
    db: { schema: "post" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export const postDbConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
