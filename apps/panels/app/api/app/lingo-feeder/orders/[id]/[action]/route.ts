import { appLingoFeeder } from "@/lib/app/access";
import { HttpError, appRoute, result } from "@/lib/app/http";
import { setOrderSent, setOrderStatus } from "@/lib/feeder/lingo-feeder/ops";

/** cancel · restore (back on) · sent (in a courier file) · unsent (back in the next courier file). */
export const POST = appRoute<RouteContext<"/api/app/lingo-feeder/orders/[id]/[action]">>(async (_request, user, ctx) => {
  const { userId } = await appLingoFeeder(user);
  const { id, action } = await ctx.params;
  switch (action) {
    case "cancel":
      return result(await setOrderStatus(userId, { id, status: "cancelled" }));
    case "restore":
      return result(await setOrderStatus(userId, { id, status: "confirmed" }));
    case "sent":
      return result(await setOrderSent(userId, { id, sent: true }));
    case "unsent":
      return result(await setOrderSent(userId, { id, sent: false }));
    default:
      throw new HttpError(404, "Unknown action.");
  }
});
