import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { publishDuePosts } from "@/lib/post/publisher";

/**
 * Posts whose time has come: claimed here and handed to the n8n worker (which
 * posts them to Facebook / Instagram). The Supabase scheduler calls this only
 * when a post is due.
 */
export const maxDuration = 120;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await publishDuePosts(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[post publish]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
