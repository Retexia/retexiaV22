import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { CONTENT_TAG } from "@/lib/content";

function secretMatches(given: string | null) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by Supabase Database Webhooks when content tables change.
 * Send the secret in the "x-revalidate-secret" header (or Authorization: Bearer).
 */
export async function POST(request: NextRequest) {
  const header =
    request.headers.get("x-revalidate-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (!secretMatches(header)) {
    return NextResponse.json({ revalidated: false, message: "Invalid secret" }, { status: 401 });
  }
  let table: string | undefined;
  try {
    const body = (await request.json()) as { table?: string };
    table = body?.table;
  } catch {
    // Body is optional.
  }
  // Expire immediately so the next visitor sees the new content.
  revalidateTag(CONTENT_TAG, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag: CONTENT_TAG, table: table ?? null, now: Date.now() });
}
