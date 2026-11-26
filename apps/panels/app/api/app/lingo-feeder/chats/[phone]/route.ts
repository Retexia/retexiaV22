import { appLingoFeeder } from "@/lib/app/access";
import { HttpError, appRoute } from "@/lib/app/http";
import { chat } from "@/lib/feeder/lingo-feeder/data";
import { windowOpen } from "@/lib/feeder/lingo-feeder/labels";
import { phoneKey } from "@/lib/feeder/lingo-feeder/ops";

/** One chat: the thread (last 300 messages), its orders and product, and whether a free reply is still allowed. */
export const GET = appRoute<RouteContext<"/api/app/lingo-feeder/chats/[phone]">>(async (_request, user, ctx) => {
  const { userId } = await appLingoFeeder(user);
  const phone = phoneKey.parse((await ctx.params).phone);
  const c = await chat(userId, phone);
  if (!c) throw new HttpError(404, "This chat doesn't exist.");
  return { ...c, canReply: windowOpen(c.chat.last_in_at) };
});
