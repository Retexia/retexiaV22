import { z } from "zod";
import { appLingoFeeder } from "@/lib/app/access";
import { HttpError, appRoute, body, result } from "@/lib/app/http";
import { markCalled, replyToChat, setChatPaused, setChatStatus } from "@/lib/feeder/lingo-feeder/ops";

/**
 * Changes to one chat, the same as the web panel:
 *   reply   { text }      send your own WhatsApp message (within 24 hours of theirs)
 *   status  { status }    set the chat's status
 *   called  { called }    called them (true) / put back on Call them (false)
 *   pause   { paused }    you answer this chat (true) / let Lingo answer again (false)
 */
export const POST = appRoute<RouteContext<"/api/app/lingo-feeder/chats/[phone]/[action]">>(async (request, user, ctx) => {
  const { userId } = await appLingoFeeder(user);
  const { phone, action } = await ctx.params;
  const b = await body(request);
  switch (action) {
    case "reply":
      return result(await replyToChat(userId, { phone, text: z.string().parse(b.text ?? "") }));
    case "status":
      return result(await setChatStatus(userId, { phone, status: z.string().parse(b.status) }));
    case "called":
      return result(await markCalled(userId, { phone, called: z.boolean().parse(b.called) }));
    case "pause":
      return result(await setChatPaused(userId, { phone, paused: z.boolean().parse(b.paused) }));
    default:
      throw new HttpError(404, "Unknown action.");
  }
});
