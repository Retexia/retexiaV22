import { after, NextResponse, type NextRequest } from "next/server";
import { dispatchOutbox } from "@/lib/outbox";
import { verifyPayhereNotification } from "@/lib/payhere";
import { handlePayhereNotification } from "@/lib/payhere-notify";

/**
 * PayHere payment notifications (notify_url, sent with every checkout).
 * Verified with md5sig (merchant secret); payments, renewals, failures and
 * cancellations are recorded, then receipts and status emails go out.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  if (!verifyPayhereNotification(fields)) {
    console.error("[payhere notify] rejected:", !process.env.PAYHERE_MERCHANT_SECRET ? "PAYHERE_MERCHANT_SECRET is not set" : fields.merchant_id !== process.env.PAYHERE_MERCHANT_ID ? "merchant_id doesn't match PAYHERE_MERCHANT_ID" : "md5sig doesn't match (wrong merchant secret for this domain?)");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const result = await handlePayhereNotification(fields);
    after(() => dispatchOutbox().then(() => undefined, () => undefined));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[payhere notify]", fields.message_type ?? fields.status_code, e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
