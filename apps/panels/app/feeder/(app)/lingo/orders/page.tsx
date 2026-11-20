import { Badge, Button, Card, EmptyState } from "@retexia/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { OrderDialogButton } from "@/components/feeder/lingo/inbox";
import { CourierButton, ExportToggle } from "@/components/feeder/lingo/orders";
import { lingoContext, orders } from "@/lib/feeder/lingo/data";
import { DELIVERY, money, showPhone, timeAgo } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "Orders · Lingo" };

const FILTERS = [
  { key: "export", label: "For the courier file" },
  { key: "confirmed", label: "Confirmed" },
  { key: "draft", label: "Not confirmed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];
const STATUS = { draft: { label: "Not confirmed", tone: "warning" }, confirmed: { label: "Confirmed", tone: "success" }, cancelled: { label: "Cancelled", tone: "neutral" } } as const;

export default async function LingoOrders({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { ctx } = await lingoContext("/lingo/orders");
  if (!ctx) return null;
  const f = (await searchParams).f;
  const filter = FILTERS.some((x) => x.key === f) ? f! : "export";
  const [list, pending] = await Promise.all([orders(ctx.id, filter), orders(ctx.id, "export")]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3 text-ink">Send confirmed orders to Feeder</h2>
          <p className="max-w-content type-small text-ink-muted">
            One courier CSV in the same format as Bulk create (name, address, tp_1, tp_2, price, qty, item_code, delivery). Upload it on Feeder like your other files. Downloaded orders are marked as sent, so nothing goes twice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CourierButton count={pending.length} />
          <Button variant="secondary" href="/lingo/orders/csv?kind=all" target="_self">All orders (CSV)</Button>
        </div>
      </Card>
      <nav aria-label="Order filter" className="flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/lingo/orders?f=${x.key}`} aria-current={filter === x.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 type-small transition-hover focus-visible:focus-ring ${filter === x.key ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-muted hover:text-ink"}`}>
            {x.label}{x.key === "export" ? ` (${pending.length})` : ""}
          </Link>
        ))}
      </nav>
      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((o) => (
            <li key={o.id}>
              <Card className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="type-label text-ink">#{o.id} · {o.product_name ?? "Product"} × {o.qty}</span>
                    <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                    {o.delivery_status ? <Badge tone="neutral">{DELIVERY[o.delivery_status]}</Badge> : null}
                    {o.status === "confirmed" ? <Badge tone={o.feeder_sync === "done" ? "neutral" : "warning"}>{o.feeder_sync === "done" ? "In a courier file" : "Not in a file yet"}</Badge> : null}
                  </p>
                  <p className="type-body text-ink">{o.name ?? "—"} · {o.contact ?? "—"}</p>
                  <p className="type-small break-words text-ink-muted">{o.address ?? "No address yet"}</p>
                  <p className="type-small text-ink-muted">
                    {money(o.total)} (item code {o.product_id_feeder ?? "—"}) · {o.status === "confirmed" && o.confirmed_at ? `confirmed ${timeAgo(o.confirmed_at)}` : `started ${timeAgo(o.created_at)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="ghost" href={`/lingo/inbox?f=all&c=${o.phone}`}>Chat {showPhone(o.phone)}</Button>
                  {o.status === "confirmed" ? <ExportToggle id={o.id} done={o.feeder_sync === "done"} /> : null}
                  <OrderDialogButton order={o} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ShoppingBag aria-hidden size={22} strokeWidth={1.5} />} title={filter === "export" ? "Nothing waiting" : "No orders here"}>{filter === "export" ? "Confirmed orders that aren't in a courier file yet show up here." : "Orders Lingo takes on WhatsApp show up here."}</EmptyState>
      )}
    </div>
  );
}
