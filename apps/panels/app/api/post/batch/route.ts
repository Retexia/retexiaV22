import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { designConfigured } from "@/lib/post/n8n";
import { runCycle } from "@/lib/post/playlist";

/**
 * The daily playlist: 06:00 planning (tomorrow's prompts) and design dispatch
 * (the day's items from 00:00). Called every 5 minutes by the Supabase scheduler.
 */
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runCycle();
    return NextResponse.json({ ...result, designer: designConfigured() ? "connected" : "N8N_POST_URL is not set" }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[post cycle]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
