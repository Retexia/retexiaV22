import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostDatabase } from "./post-db.types";

export type PostDb = SupabaseClient<PostDatabase>;

let client: PostDb | null = null;

/**
 * Service-role client for the Retexia Post database. Server code only.
 * It bypasses RLS, so every query MUST be scoped to the signed-in owner's
 * business (see requireBusiness() in lib/session.ts).
 */
export function postDb(): PostDb {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL2;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY2;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL2 and SUPABASE_SERVICE_ROLE_KEY2 must be set (apps/post, server-side).");
  client = createClient<PostDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

export const postDbConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL2 && process.env.SUPABASE_SERVICE_ROLE_KEY2);
