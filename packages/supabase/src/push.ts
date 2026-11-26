import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Sends queued app notifications (notifications_outbox, channel "push", migration 0044) to every
 * phone the person is signed in to the Retexia app on, through the Expo Push API (Expo hands them
 * to Firebase Cloud Messaging on Android, APNs on iPhone).
 *
 * Rows are claimed by attempts, like emails. A phone Expo says is gone (DeviceNotRegistered) is
 * disabled so it gets nothing more. EXPO_ACCESS_TOKEN is optional: set it when "enhanced push
 * security" is on in the Expo project.
 *
 * Called by admin.retexia.com (/api/notifications/dispatch, after status changes) and by
 * feeder.retexia.com/api/push/tick (a database trigger on new push rows + a one-minute retry).
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Android notification channels the app creates (apps/mobile/lib/push.ts). */
const channelFor = (event: string) => (event === "lingo_feeder.call" ? "calls" : event === "lingo_feeder.order" ? "orders" : "default");

type Ticket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };

async function sendToExpo(messages: Record<string, unknown>[]): Promise<{ ok: true; tickets: Ticket[] } | { ok: false; error: string }> {
  const headers: Record<string, string> = { accept: "application/json", "accept-encoding": "gzip, deflate", "content-type": "application/json" };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const out = (await res.json().catch(() => null)) as { data?: Ticket[]; errors?: { message?: string }[] } | null;
    if (!res.ok || !out?.data) return { ok: false, error: out?.errors?.[0]?.message ?? `Expo answered ${res.status}` };
    return { ok: true, tickets: out.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Expo didn't answer" };
  }
}

/** `db` must be a service-role client (it reads every person's push tokens). */
export async function dispatchPush(db: SupabaseClient<Database>, limit = 50): Promise<{ sent: number; failed: number }> {
  const { data: rows } = await db
    .from("notifications_outbox")
    .select("id, event, user_id, subject, body, payload, attempts")
    .eq("channel", "push")
    .eq("status", "pending")
    .lt("attempts", 5)
    .order("created_at")
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const n of rows ?? []) {
    const { data: claimed } = await db.from("notifications_outbox").update({ attempts: (n.attempts ?? 0) + 1 }).eq("id", n.id).eq("attempts", n.attempts ?? 0).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    const finish = async (ok: boolean, error: string | null) => {
      await db.from("notifications_outbox")
        .update(ok ? { status: "sent", sent_at: new Date().toISOString(), error: null } : { status: (n.attempts ?? 0) + 1 >= 5 || error === "No phone with the app" ? "failed" : "pending", error })
        .eq("id", n.id);
      if (ok) sent++;
      else failed++;
    };

    const { data: phones } = n.user_id
      ? await db.from("push_tokens").select("id, expo_token").eq("user_id", n.user_id).eq("disabled", false)
      : { data: [] };
    if (!phones?.length) {
      await finish(false, "No phone with the app");
      continue;
    }
    const payload = (n.payload ?? {}) as Record<string, unknown>;
    const data = { id: n.id, event: n.event, url: typeof payload.url === "string" ? payload.url : "/inbox" };
    const messages = phones.map((p) => ({
      to: p.expo_token,
      title: n.subject ?? "Retexia",
      body: n.body ?? "",
      data,
      sound: "default",
      priority: "high",
      channelId: channelFor(n.event),
    }));
    const res = await sendToExpo(messages);
    if (!res.ok) {
      await finish(false, res.error);
      continue;
    }
    let delivered = 0;
    let lastError: string | null = null;
    for (const [i, t] of res.tickets.entries()) {
      if (t.status === "ok") {
        delivered++;
        continue;
      }
      lastError = t.message ?? t.details?.error ?? "Expo refused it";
      if (t.details?.error === "DeviceNotRegistered" && phones[i]) {
        await db.from("push_tokens").update({ disabled: true, disabled_reason: "The app was removed from this phone" }).eq("id", phones[i].id);
      }
    }
    await finish(delivered > 0, delivered > 0 ? null : lastError);
  }
  return { sent, failed };
}
