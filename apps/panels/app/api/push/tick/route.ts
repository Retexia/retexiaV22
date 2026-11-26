import type { Database } from "@retexia/supabase/types";
import { dispatchPush } from "@retexia/supabase/push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { publicDb } from "@/lib/plan/db";

/**
 * Sends queued app push notifications (notifications_outbox, channel "push"). Called by the
 * database (migration 0045): at once when a push row is added, and every minute while any wait
 * (retries). X-Retexia-Key = POST_CRON_KEY.
 */
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchPush(publicDb() as unknown as SupabaseClient<Database>, 100);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[push tick]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
