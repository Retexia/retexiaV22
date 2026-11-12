import "server-only";

import { createClient } from "@supabase/supabase-js";

function make(schema: "plan" | "public") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (apps/panels, server-side).");
  return createClient(url, key, { db: { schema }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
let plan: ReturnType<typeof make> | null = null;
let pub: ReturnType<typeof make> | null = null;

/**
 * Service-role clients for Retexia Plan (schema "plan") and for names and
 * emails (public.profiles). Server code only: every query MUST be limited to
 * what the signed-in person may see (lib/plan/session.ts → goalAccess()).
 */
export const planDb = () => (plan ??= make("plan"));
export const publicDb = () => (pub ??= make("public"));
export type PlanDb = ReturnType<typeof planDb>;
