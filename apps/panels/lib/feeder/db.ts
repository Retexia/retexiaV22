import "server-only";

import { createClient } from "@supabase/supabase-js";

function make() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (apps/panels, server-side).");
  return createClient(url, key, { db: { schema: "feeder" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export type FeederDb = ReturnType<typeof make>;
let client: FeederDb | null = null;

/**
 * Service-role client for the "feeder" schema (Feeder products, customers and
 * their form names). Server code only. It bypasses RLS: every customer query
 * MUST filter by the signed-in user's id (see lib/feeder/data.ts).
 */
export function feederDb(): FeederDb {
  return (client ??= make());
}
