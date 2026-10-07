import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runNightlyBatch } from "@/lib/post/batch";
import { designConfigured } from "@/lib/post/n8n";

/** Starts the nightly posts for businesses where it is about 1 AM. Called every 5 minutes by the scheduler. */
export const maxDuration = 120;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!designConfigured()) return NextResponse.json({ error: "N8N_PHOTO_POST_URL is not set" }, { status: 503 });
  try {
    return NextResponse.json(await runNightlyBatch(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[post batch]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
