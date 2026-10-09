import { after, NextResponse, type NextRequest } from "next/server";
import { dispatchOutbox } from "@/lib/outbox";
import { fromPaddleIp, verifyPaddleSignature } from "@/lib/paddle";
import { handlePaddleEvent } from "@/lib/paddle-webhook";

/**
 * Paddle notifications (Paddle → Developer tools → Notifications → destination
 * https://admin.retexia.com/api/paddle/webhook). Signed with PADDLE_WEBHOOK_SECRET.
 * Answers 200 once handled; a 500 makes Paddle retry.
 */
export async function POST(request: NextRequest) {
  // Only Paddle's published IPs (Vercel puts the caller's IP first in x-forwarded-for).
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const allowed = await fromPaddleIp(ip);
  if (allowed === null) return NextResponse.json({ error: "Try again" }, { status: 503 });
  if (!allowed) {
    console.error("[paddle webhook] rejected: not a Paddle IP", ip);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const raw = await request.text();
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), process.env.PADDLE_WEBHOOK_SECRET)) {
    // Visible in Vercel → admin project → Logs.
    console.error(
      "[paddle webhook] rejected:",
      !process.env.PADDLE_WEBHOOK_SECRET ? "PADDLE_WEBHOOK_SECRET is not set" : !request.headers.get("paddle-signature") ? "no Paddle-Signature header" : "signature doesn't match PADDLE_WEBHOOK_SECRET (or clock skew)",
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: { event_id?: string; event_type?: string; occurred_at?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event.event_id || !event.event_type || !event.data) return NextResponse.json({ error: "Not a Paddle event" }, { status: 400 });
  try {
    const result = await handlePaddleEvent({ event_id: event.event_id, event_type: event.event_type, occurred_at: event.occurred_at, data: event.data });
    // Receipts and status emails queued by the database go out now.
    after(() => dispatchOutbox().then(() => undefined, () => undefined));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[paddle webhook]", event.event_type, e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
