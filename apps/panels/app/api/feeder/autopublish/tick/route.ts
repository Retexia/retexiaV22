import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runTick } from "@/lib/feeder/autopublish/runner";

/**
 * Autopublish's clock (WF-03 Runner): Supabase pg_cron calls it every minute,
 * only when a launch is due (X-Retexia-Key = POST_CRON_KEY). Builds, switches
 * on and watches launches, a few small steps at a time.
 */
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runTick({ budgetMs: 200_000, worker: "cron" });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[autopublish tick]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
