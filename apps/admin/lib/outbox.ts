import "server-only";

import { createAdminClient } from "@retexia/supabase/admin";
import { emailConfigured, notificationHtml, notificationLink, sendEmail } from "./email";

/**
 * Sends queued email notifications (notifications_outbox, channel "email")
 * through Resend and marks each sent or failed. WhatsApp rows are left for
 * n8n. Safe to call often: rows are claimed by status so each is sent once.
 */
export async function dispatchOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  if (!emailConfigured()) return { sent: 0, failed: 0 };
  const db = createAdminClient();
  const { data: rows } = await db
    .from("notifications_outbox")
    .select("id, event, recipient, subject, body, payload, attempts")
    .eq("channel", "email")
    .eq("status", "pending")
    .lt("attempts", 5)
    .order("created_at")
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const n of rows ?? []) {
    // Claim the row (attempts + 1) so a parallel run skips it.
    const { data: claimed } = await db.from("notifications_outbox").update({ attempts: (n.attempts ?? 0) + 1 }).eq("id", n.id).eq("attempts", n.attempts ?? 0).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    if (!n.recipient) {
      await db.from("notifications_outbox").update({ status: "failed", error: "No recipient" }).eq("id", n.id);
      failed++;
      continue;
    }
    const payload = (n.payload ?? {}) as Record<string, unknown>;
    const audience = payload.audience === "staff" ? "staff" : "customer";
    const subject = n.subject || "An update from Retexia";
    const body = n.body || "";
    const res = await sendEmail({
      to: n.recipient,
      subject,
      text: body,
      html: notificationHtml({ heading: subject, body, button: notificationLink(payload, audience) }),
    });
    await db
      .from("notifications_outbox")
      .update(res.ok ? { status: "sent", sent_at: new Date().toISOString(), error: null } : { status: (n.attempts ?? 0) + 1 >= 5 ? "failed" : "pending", error: res.error })
      .eq("id", n.id);
    if (res.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
