import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runMorning, runWeekly } from "@/lib/plan/reminders";

/**
 * Retexia Plan's clock: every 15 minutes (Supabase pg_cron, X-Retexia-Key =
 * POST_CRON_KEY) it sends the morning WhatsApp messages and the Sunday emails
 * that are due.
 */
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [morning, weekly] = await Promise.all([runMorning(), runWeekly()]);
    return NextResponse.json({ morning, weekly }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[plan tick]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
