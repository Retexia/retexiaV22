import { appRoute, json } from "@/lib/app/http";

/** The app's Inbox: this person's last 100 app notifications (RLS: their own push rows only). */
export const GET = appRoute(async (_request, user) => {
  const [{ data: rows, error }, { data: prefs }] = await Promise.all([
    user.sb.from("notifications_outbox").select("id, event, subject, body, payload, created_at").eq("channel", "push").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(100),
    user.sb.from("notification_prefs").select("inbox_seen_at").eq("user_id", user.id).maybeSingle(),
  ]);
  if (error) throw new Error(`inbox: ${error.message}`);
  const seen = prefs?.inbox_seen_at ? new Date(prefs.inbox_seen_at).getTime() : 0;
  return {
    items: (rows ?? []).map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        event: r.event,
        title: r.subject ?? "",
        body: r.body ?? "",
        url: typeof p.url === "string" ? p.url : null,
        at: r.created_at,
        unread: new Date(r.created_at).getTime() > seen,
      };
    }),
  };
});

/** Opened the Inbox: everything so far is read. */
export const POST = appRoute(async (_request, user) => {
  const { error } = await user.sb.from("notification_prefs").upsert({ user_id: user.id, inbox_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`inbox seen: ${error.message}`);
  return json({ message: null });
});
