import "server-only";

import { createClient } from "@supabase/supabase-js";

function make() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (apps/panels, server-side).");
  return createClient(url, key, { db: { schema: "lingo_feeder" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export type LfDb = ReturnType<typeof make>;
let client: LfDb | null = null;

/**
 * Service-role client for Lingo Feeder (schema "lingo_feeder"). Server code only.
 * It bypasses RLS: every query MUST filter by the seller's user_id from lingoFeederContext()
 * / lingoFeederActor() (lib/feeder/lingo-feeder/data.ts), never by an id from the request.
 */
export function lfDb(): LfDb {
  return (client ??= make());
}
