import { appLingoFeeder } from "@/lib/app/access";
import { appRoute } from "@/lib/app/http";
import { home, orders } from "@/lib/feeder/lingo-feeder/data";

const VIEWS = ["new", "sent", "cancelled", "all"] as const;

/** Orders. ?view=new (confirmed, not in a courier file yet) | sent | cancelled | all. */
export const GET = appRoute(async (request, user) => {
  const { userId } = await appLingoFeeder(user);
  const raw = new URL(request.url).searchParams.get("view") ?? "new";
  const view = (VIEWS as readonly string[]).includes(raw) ? (raw as (typeof VIEWS)[number]) : "new";
  const [list, h] = await Promise.all([orders(userId, view), home(userId)]);
  return { view, orders: list, toExport: h.to_export };
});
