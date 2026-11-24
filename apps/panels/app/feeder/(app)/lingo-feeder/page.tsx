import { Alert, Button, Card } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import Link from "next/link";
import { home, lingoFeederContext, orders } from "@/lib/feeder/lingo-feeder/data";
import { STATUS_ORDER, lkr, statusOf, timeAgo } from "@/lib/feeder/lingo-feeder/labels";

export default async function LingoFeederHome() {
  const { ctx } = await lingoFeederContext("/lingo-feeder");
  if (!ctx) return null;
  const [h, latest] = await Promise.all([home(ctx.userId), orders(ctx.userId, "all")]);
  const counts = { ...h.statuses, call: h.call } as Record<string, number>;
  const total = Object.entries(h.statuses).filter(([k]) => k !== "spam").reduce((a, [, n]) => a + Number(n), 0);
  const steps = [
    { done: ctx.seller.business_name !== "My shop", label: "Business details", href: "/lingo-feeder/business" },
    { done: Boolean(ctx.number), label: "Connect WhatsApp", href: "/lingo-feeder/whatsapp" },
    { done: ctx.number?.status === "connected", label: "Test connection", href: "/lingo-feeder/whatsapp" },
    { done: ctx.seller.status === "live", label: "Switch Lingo on", href: "/lingo-feeder" },
  ];
  return (
    <div className="flex flex-col gap-6">
      {steps.some((s) => !s.done) ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Get Lingo ready</h2>
          <ol className="grid gap-2 sm:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link href={s.href} className={`flex items-center gap-2 rounded-md border px-3 py-2 type-small focus-visible:focus-ring ${s.done ? "border-success/30 bg-success-soft text-success" : "border-line bg-surface-raised text-ink hover:bg-surface-sunk"}`}>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-raised type-small text-ink">{s.done ? "✓" : i + 1}</span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
          <p className="type-small text-ink-muted">Meanwhile, see how she talks to customers in <Link href="/lingo-feeder/try" className="text-brand underline-offset-2 hover:underline">Try Lingo</Link>.</p>
        </Card>
      ) : null}
      {h.unmatched_ads ? (
        <Alert tone="warning" title={`${h.unmatched_ads} ad${h.unmatched_ads === 1 ? "" : "s"} without a product`} action={<Button href="/lingo-feeder/products#ads" size="sm" variant="secondary">Choose</Button>}>
          Lingo couldn&apos;t tell which product these ads sell, so she asks the customer. Pick the product once and she knows.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="New chats today" value={String(h.chats_today)} hint={`${h.chats_month} this month`} href="/lingo-feeder/chats" />
        <StatCard label="Orders today" value={String(h.orders_today)} hint={`${h.orders_month} this month · ${lkr(h.sales_month)}`} href="/lingo-feeder/orders" tone={h.orders_today ? "success" : "neutral"} />
        <StatCard label="Call them" value={String(h.call)} hint="Asked for a call or need you" href="/lingo-feeder/chats?status=call" tone={h.call ? "danger" : "neutral"} />
        <StatCard label="For the courier file" value={String(h.to_export)} hint="Confirmed, not downloaded yet" href="/lingo-feeder/orders" tone={h.to_export ? "warning" : "neutral"} />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Every chat by status</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STATUS_ORDER.map((k) => {
            const n = Number(counts[k] ?? 0);
            const pct = total && k !== "call" && k !== "spam" ? Math.round((n / total) * 100) : null;
            return (
              <li key={k}>
                <Link href={`/lingo-feeder/chats?status=${k}`} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-raised px-3 py-2 hover:bg-surface-sunk focus-visible:focus-ring">
                  <span className="flex min-w-0 flex-col">
                    <span className="type-label text-ink">{k === "call" ? "📞 " : ""}{statusOf(k).label}</span>
                    <span className="truncate type-small text-ink-muted">{statusOf(k).hint}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="type-h3 text-ink">{n}</span>
                    {pct !== null ? <span className="type-small text-ink-muted">{pct}%</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-h3 text-ink">Latest orders</h2>
          <Button href="/lingo-feeder/orders" size="sm" variant="ghost">All orders</Button>
        </div>
        {latest.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {latest.slice(0, 6).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/lingo-feeder/chats/${o.phone}`} className="min-w-0 flex-1 truncate type-body text-ink hover:text-brand">{o.name ?? "—"} · {o.product_name} × {o.qty}</Link>
                <span className="type-small text-ink-muted">{lkr(o.total)} · {o.status === "cancelled" ? "cancelled" : timeAgo(o.confirmed_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-ink-muted">No orders yet. They appear here as soon as a customer confirms.</p>
        )}
      </Card>
    </div>
  );
}
