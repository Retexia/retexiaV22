import { z } from "zod";
import { appRoute, body, json } from "@/lib/app/http";
import { PUSH_KEYS, PUSH_KINDS } from "@/lib/app/notifications";

/** App notification settings: on / off and muted kinds (public.notification_prefs, RLS: their own). */
export const GET = appRoute(async (_request, user) => {
  const { data } = await user.sb.from("notification_prefs").select("push, muted").eq("user_id", user.id).maybeSingle();
  return { push: data?.push ?? true, muted: data?.muted ?? [], kinds: PUSH_KINDS };
});

const schema = z.object({ push: z.boolean(), muted: z.array(z.enum(PUSH_KEYS)).max(PUSH_KEYS.length) });

export const PUT = appRoute(async (request, user) => {
  const d = schema.parse(await body(request));
  const { error } = await user.sb.from("notification_prefs").upsert({ user_id: user.id, push: d.push, muted: [...new Set(d.muted)] }, { onConflict: "user_id" });
  if (error) throw new Error(`notification_prefs: ${error.message}`);
  return json({ message: "Saved." });
});
