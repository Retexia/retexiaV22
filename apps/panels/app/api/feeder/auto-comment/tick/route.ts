import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { checkComments } from "@/lib/feeder/auto-comment/runner";

/**
 * Auto comment's clock: Supabase pg_cron calls it every minute while anyone has
 * Auto comment on (X-Retexia-Key = POST_CRON_KEY). Reads new comments on each
 * customer's ads and Page posts and replies / hides / messages.
 */
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await checkComments({ budgetMs: 45_000 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[auto comment tick]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
