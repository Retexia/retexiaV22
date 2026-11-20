import { Badge, Card, EmptyState } from "@retexia/ui";
import { Megaphone } from "lucide-react";
import { AdProductSelect } from "@/components/feeder/lingo/ads";
import { ads, lingoContext, products } from "@/lib/feeder/lingo/data";
import { timeAgo } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "Ads · Lingo" };

export default async function LingoAds() {
  const { ctx } = await lingoContext("/lingo/ads");
  if (!ctx) return null;
  const [list, prods] = await Promise.all([ads(ctx.id), products(ctx.id)]);
  if (!list.length)
    return (
      <EmptyState icon={<Megaphone aria-hidden size={22} strokeWidth={1.5} />} title="No ads yet">
        When someone taps one of your Click-to-WhatsApp ads, the ad shows up here. Lingo works out which product it sells once (one small AI call) and remembers it.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="type-small text-ink-muted">Each ad sends its customers to one product. Fix any that Lingo matched wrongly; new customers from that ad get the right product straight away.</p>
      <ul className="flex flex-col gap-3">
        {list.map((a) => {
          const conv = a.chats ? Math.round((a.orders / a.chats) * 100) : 0;
          return (
            <li key={a.ad_id}>
              <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="type-label break-words text-ink">{a.headline || "Ad without a headline"}</span>
                    {!a.product_id ? <Badge tone="warning">Pick the product</Badge> : a.auto_matched ? <Badge tone="neutral">Matched by Lingo</Badge> : <Badge tone="neutral">Set by you</Badge>}
                  </p>
                  {a.body ? <p className="line-clamp-2 type-small text-ink-muted">{a.body}</p> : null}
                  <p className="type-small text-ink-muted">
                    {a.chats} chat{a.chats === 1 ? "" : "s"} · {a.orders} order{a.orders === 1 ? "" : "s"} · {conv}% conversion · first seen {timeAgo(a.created_at)} · ad {a.ad_id.slice(0, 24)}
                  </p>
                </div>
                <div className="w-full md:w-72">
                  <AdProductSelect adId={a.ad_id} productId={a.product_id} products={prods.map((p) => ({ id: p.id, name: p.name }))} label={`Product for the ad ${a.headline ?? a.ad_id}`} />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
