import { appLingoFeeder } from "@/lib/app/access";
import { appRoute } from "@/lib/app/http";
import { chats, home } from "@/lib/feeder/lingo-feeder/data";
import { STATUS } from "@/lib/feeder/lingo-feeder/labels";

/** Chats, newest first. ?status=all|call|new|asking|… &q=name or phone. Also the counts for the status chips. */
export const GET = appRoute(async (request, user) => {
  const { userId } = await appLingoFeeder(user);
  const sp = new URL(request.url).searchParams;
  const raw = sp.get("status") ?? "all";
  const status = raw in STATUS || raw === "all" ? raw : "all";
  const q = (sp.get("q") ?? "").trim().slice(0, 60) || null;
  const [list, h] = await Promise.all([chats(userId, status, q), home(userId)]);
  const all = Object.entries(h.statuses ?? {}).filter(([k]) => k !== "spam").reduce((a, [, n]) => a + Number(n), 0);
  return { status, chats: list, counts: { ...h.statuses, call: h.call, all } };
});
