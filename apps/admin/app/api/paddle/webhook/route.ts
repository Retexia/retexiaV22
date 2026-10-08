import { after, NextResponse, type NextRequest } from "next/server";
import { dispatchOutbox } from "@/lib/outbox";
import { verifyPaddleSignature } from "@/lib/paddle";
import { handlePaddleEvent } from "@/lib/paddle-webhook";

/**
 * Paddle notifications (Paddle → Developer tools → Notifications → destination
 * https://admin.retexia.com/api/paddle/webhook). Signed with PADDLE_WEBHOOK_SECRET.
 * Answers 200 once handled; a 500 makes Paddle retry.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), process.env.PADDLE_WEBHOOK_SECRET)) {
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
