import "server-only";

import { createClient } from "@supabase/supabase-js";

function make() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (apps/panels, server-side).");
  return createClient(url, key, { db: { schema: "lingo" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export type BotDb = ReturnType<typeof make>;
let client: BotDb | null = null;

/**
 * Service-role client for Feeder → Lingo (schema "lingo", bot_* tables). Server code only.
 * It bypasses RLS: every query MUST filter by the seller's lingo_user_id from lingoContext()
 * / lingoActor() (lib/feeder/lingo/data.ts), never by an id from the request.
 */
export function botDb(): BotDb {
  return (client ??= make());
}
