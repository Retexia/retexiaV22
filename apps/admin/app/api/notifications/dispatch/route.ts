import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dispatchOutbox } from "@/lib/outbox";

/**
 * Sends pending email notifications. Called by a Supabase Database Webhook on
 * notifications_outbox INSERT (so emails queued by the website go out at once),
 * with the header x-retexia-secret = OUTBOX_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.OUTBOX_WEBHOOK_SECRET ?? "";
  const given = request.headers.get("x-retexia-secret") ?? "";
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await dispatchOutbox(50);
  return NextResponse.json(result);
}
