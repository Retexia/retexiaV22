import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { publishDuePosts } from "@/lib/post/publisher";

/** Publishes Retexia Post posts whose time has come. Called every minute by the scheduler. */
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
