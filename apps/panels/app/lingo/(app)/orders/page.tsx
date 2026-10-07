import { Card, StatusBadge, cn, formatDate } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import Link from "next/link";
import { OrderPanel } from "@/components/lingo/order-panel";
import type { OrderStatus } from "@/lib/lingo/db.types";
import { ORDER_STATUS, displayName, money, statusMessage } from "@/lib/lingo/labels";
import { requireLingoPage } from "@/lib/lingo/session";

export const metadata = { title: "Orders" };

const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "todo", label: "To handle", statuses: ["confirmed", "processing"] },
  { key: "shipped", label: "Sent", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "draft", label: "Not confirmed", statuses: ["draft"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "all", label: "All", statuses: ["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"] },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { tenant, db } = await requireLingoPage("/orders");
  const tab = TABS.find((t) => t.key === sp.status) ?? TABS[0]!;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  let query = db.from("orders").select("*").eq("lingo_user_id", tenant.id).in("status", tab.statuses).order("created_at", { ascending: false }).limit(200);
  if (q) {
    const safe = q.replace(/[%,()"]/g, " ");
    query = /^\d+$/.test(q) ? query.or(`id.eq.${q},delivery_phone.ilike.%${safe}%`) : query.or(`customer_name.ilike.%${safe}%,product_name.ilike.%${safe}%,address.ilike.%${safe}%`);
  }
  const [{ data: orders }, ...counts] = await Promise.all([
    query,
    ...TABS.map((t) => db.from("orders").select("id", { count: "exact", head: true }).eq("lingo_user_id", tenant.id).in("status", t.statuses)),
  ]);
  const openId = Number(sp.open) || null;
  let open = (orders ?? []).find((o) => o.id === openId) ?? null;
  if (!open && openId) open = (await db.from("orders").select("*").eq("id", openId).eq("lingo_user_id", tenant.id).maybeSingle()).data;
  const { data: cust } = open ? await db.from("customers").select("id, customer_name, whatsapp_name, number, language, bot_paused").eq("id", open.customer_id).eq("lingo_user_id", tenant.id).maybeSingle() : { data: null };
  const href = (extra: Record<string, string | number | null>) => {
    const u = new URLSearchParams();
    const merged: Record<string, string | number | null> = { status: tab.key === "todo" ? null : tab.key, q: q || null, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") u.set(k, String(v));
    return u.size ? `/orders?${u}` : "/orders";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Orders" description="Orders customers placed through Lingo. Move them along as you pack and send them; tick “tell the customer” to send a WhatsApp update." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Order status" className="flex flex-wrap gap-1">
          {TABS.map((t, i) => (
            <Link key={t.key} href={t.key === "todo" ? `/orders${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/orders?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={tab.key === t.key ? "page" : undefined} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 type-label", tab.key === t.key ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}>
              {t.label} <span className="type-small">{counts[i]?.count ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form method="get" action="/orders" className="flex gap-2">
          {tab.key !== "todo" ? <input type="hidden" name="status" value={tab.key} /> : null}
          <input name="q" type="search" defaultValue={q} aria-label="Search orders" placeholder="Order #, name, product, phone" className="h-9 w-56 rounded-full border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring" />
          <a href={`/orders/export?status=${tab.key}`} className="inline-flex h-9 items-center rounded-full border border-line-strong px-3 type-label text-ink hover:bg-surface-sunk focus-visible:focus-ring">
            CSV
          </a>
        </form>
      </div>
      <div className={cn("grid gap-6", open && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]")}>
        <Card padded={false} className="self-start">
          {(orders ?? []).length ? (
            <ul className="divide-y divide-line">
              {(orders ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={href({ open: o.id })} aria-current={o.id === open?.id ? "true" : undefined} className={cn("flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-sunk focus-visible:focus-ring", o.id === open?.id && "bg-brand-soft/50")}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate type-label text-ink">
                        #{o.id} {o.product_name} × {o.quantity}
                      </span>
                      <span className="truncate type-small text-ink-muted">
                        {o.customer_name ?? "No name yet"} · {formatDate(o.created_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="type-small text-ink">{money(o.total_price)}</span>
                      <StatusBadge tone={ORDER_STATUS[o.status].tone} label={ORDER_STATUS[o.status].label} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center type-body text-ink-muted">No orders here.</p>
          )}
        </Card>
        {open ? (
          <OrderPanel
            key={open.id}
            order={open}
            customer={cust ? { id: cust.id, name: displayName(cust), number: cust.number, botPaused: cust.bot_paused } : null}
            messages={Object.fromEntries(
              (["confirmed", "processing", "shipped", "delivered", "cancelled"] as const).map((s) => [s, statusMessage(s, cust?.language ?? tenant.default_language, { id: open!.id, product: open!.product_name, customer: open!.customer_name ?? cust?.customer_name ?? cust?.whatsapp_name ?? null, business: tenant.business_name })]),
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
