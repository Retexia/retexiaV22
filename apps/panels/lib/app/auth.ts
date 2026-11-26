import "server-only";

import { requireSupabaseEnv } from "@retexia/supabase";
import type { Database } from "@retexia/supabase/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Retexia app (apps/mobile) calls /api/app/* with `Authorization: Bearer <Supabase access
 * token>`: the same Supabase users and sessions as retexia.com, kept in the phone's secure store.
 *
 * appUser() checks the token with Supabase Auth (signature, expiry, a signed-out or deleted user)
 * and returns a client that acts AS that person: Row Level Security applies to every query, exactly
 * like their cookie session in the panels. Service-role clients (lfDb…) may only be used after
 * this, filtered by the id returned here; never by an id from the request.
 */
export type AppUser = { id: string; email: string; token: string; sb: SupabaseClient<Database> };

const BEARER = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/;

export async function appUser(request: Request): Promise<AppUser | null> {
  const m = BEARER.exec((request.headers.get("authorization") ?? "").trim());
  if (!m) return null;
  const token = m[1]!;
  const { url, anonKey } = requireSupabaseEnv();
  const sb = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  if (data.user.banned_until && new Date(data.user.banned_until).getTime() > Date.now()) return null;
  return { id: data.user.id, email: data.user.email ?? "", token, sb };
}
