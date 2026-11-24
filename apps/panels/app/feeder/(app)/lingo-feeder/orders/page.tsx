import { OrdersView } from "@/components/feeder/lingo-feeder/orders";
import { lingoFeederContext, orders } from "@/lib/feeder/lingo-feeder/data";

export const metadata = { title: "Orders · Lingo Feeder" };

const VIEWS = ["new", "sent", "cancelled", "all"] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { ctx } = await lingoFeederContext("/lingo-feeder/orders");
  if (!ctx) return null;
  const v = (await searchParams).view;
  const view = (VIEWS as readonly string[]).includes(v ?? "") ? (v as (typeof VIEWS)[number]) : "new";
  const [list, fresh] = await Promise.all([orders(ctx.userId, view), view === "new" ? null : orders(ctx.userId, "new")]);
  return <OrdersView view={view} orders={list} newCount={(fresh ?? list).length} />;
}
