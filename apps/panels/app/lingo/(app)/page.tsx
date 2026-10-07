import { Alert, Card, StatusBadge, formatDate } from "@retexia/ui";
import { PageHeader, StatCard } from "@retexia/ui/admin";
import Link from "next/link";
import { ActivityChart } from "@/components/lingo/activity-chart";
import { ORDER_STATUS, money } from "@/lib/lingo/labels";
import { requireLingoPage } from "@/lib/lingo/session";
import { connectionState } from "@/lib/lingo/evolution";
import { daysAgoIso } from "@/lib/time";

export const metadata = { title: "Overview" };

const PAID = ["confirmed", "processing", "shipped", "delivered"];

export default async function LingoOverview() {
  const { customer, tenant, db } = await requireLingoPage("/");
  const since = daysAgoIso(30);
  const { data: line } = await db.from("lingo_users").select("evolution_base_url, evolution_instance, evolution_apikey").eq("id", tenant.id).single();
  const [wa, daily, { data: todo }, { data: recentOrders }, { data: active }, { data: products }, { count: followups }, { data: biz }, { count: productCount }] = await Promise.all([
    line ? connectionState(line.evolution_base_url, line.evolution_instance, line.evolution_apikey, 4000) : Promise.resolve("unknown" as const),
    db.rpc("panel_daily_stats", { p_user: tenant.id, p_days: 30 }),
    db.from("orders").select("id, product_name, quantity, total_price, status, customer_name, created_at").eq("lingo_user_id", tenant.id).in("status", ["confirmed", "processing"]).order("created_at").limit(8),
    db.from("orders").select("product_id, product_name, total_price, status").eq("lingo_user_id", tenant.id).gte("created_at", since).neq("status", "draft").limit(5000),
    db.from("customers").select("seen_products").eq("lingo_user_id", tenant.id).gte("last_customer_msg_at", since).limit(5000),
    db.from("products").select("id, product_name").eq("lingo_user_id", tenant.id),
    db.from("customers").select("id", { count: "exact", head: true }).eq("lingo_user_id", tenant.id).eq("followup_due", true).eq("bot_paused", false),
    db.from("business_details").select("about, opening_hours, contact_phone").eq("lingo_user_id", tenant.id).maybeSingle(),
    db.from("products").select("id", { count: "exact", head: true }).eq("lingo_user_id", tenant.id).eq("active", true),
  ]);
  const days = daily.data ?? [];
  const sum = (k: "customer_messages" | "new_customers" | "orders" | "revenue") => days.reduce((n, d) => n + Number(d[k] ?? 0), 0);
  const viewCount = new Map<number, number>();
  for (const c of active ?? []) for (const p of c.seen_products ?? []) viewCount.set(p, (viewCount.get(p) ?? 0) + 1);
  const paidOrders = (recentOrders ?? []).filter((o) => PAID.includes(o.status));
  const sold = new Map<string, { n: number; total: number }>();
  for (const o of paidOrders) {
    const k = o.product_name ?? "Other";
    const cur = sold.get(k) ?? { n: 0, total: 0 };
    sold.set(k, { n: cur.n + 1, total: cur.total + Number(o.total_price ?? 0) });
  }
  const names = new Map((products ?? []).map((p) => [p.id, p.product_name]));
  const topViewed = [...viewCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topSold = [...sold.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  const activeCustomers = (active ?? []).length;
  const conversion = activeCustomers ? Math.round((paidOrders.length / activeCustomers) * 100) : 0;
  const missing = [!biz?.about && "about your business", !biz?.opening_hours && "opening hours", !biz?.contact_phone && "contact phone", !productCount && "products"].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Hi ${customer.name.split(" ")[0] || tenant.business_name}`} description="What Lingo did on your WhatsApp in the last 30 days." />
      {wa === "close" || wa === "connecting" ? (
        <Alert tone="danger" title="Your WhatsApp is not linked" action={<Link href="/connect" className="text-link">Link it now</Link>}>
          Lingo can&apos;t read or answer messages until your business WhatsApp is linked. It takes a minute: scan a code with your phone.
        </Alert>
      ) : null}
      {!tenant.active ? <Alert tone="warning" title="Lingo is paused">Customers&apos; messages are not being answered. Turn it on at the top of the page.</Alert> : null}
      {missing.length ? (
        <Alert tone="info" title="Help Lingo answer better">
          Add {missing.join(", ")} in <Link href={missing.includes("products") && missing.length === 1 ? "/products" : "/business"} className="text-link">{missing.includes("products") && missing.length === 1 ? "Products" : "Business details"}</Link>.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers who messaged" value={activeCustomers} hint={`${sum("new_customers")} new`} href="/customers" />
        <StatCard label="Messages answered" value={sum("customer_messages")} hint="Customer messages Lingo handled" />
        <StatCard label="Orders" value={paidOrders.length} hint={`${conversion}% of chatting customers ordered`} href="/orders" />
        <StatCard label="Sales" value={money(sum("revenue"))} hint="Confirmed orders" href="/orders?status=delivered" />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Messages and orders per day</h2>
        <ActivityChart days={days.map((d) => ({ day: String(d.day), customer_messages: Number(d.customer_messages), orders: Number(d.orders) }))} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="self-start lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="type-h3 text-ink">Orders to handle</h2>
            <Link href="/orders" className="type-label text-link">
              All orders
            </Link>
          </div>
          {(todo ?? []).length ? (
            <ul className="divide-y divide-line">
              {(todo ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={`/orders?open=${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-sunk focus-visible:focus-ring">
                    <span className="flex flex-col">
                      <span className="type-label text-ink">
                        #{o.id} {o.product_name} × {o.quantity}
                      </span>
                      <span className="type-small text-ink-muted">
                        {o.customer_name ?? "Customer"} · {formatDate(o.created_at)}
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
            <p className="px-5 py-8 text-center type-body text-ink-muted">Nothing to send right now.</p>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="type-h3 text-ink">Best sellers</h2>
            {topSold.length ? (
              <ol className="flex flex-col gap-2">
                {topSold.map(([name, v]) => (
                  <li key={name} className="flex justify-between gap-2 type-small">
                    <span className="truncate text-ink">{name}</span>
                    <span className="shrink-0 text-ink-muted">
                      {v.n} · {money(v.total)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="type-small text-ink-muted">No orders yet.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="type-h3 text-ink">Most asked about</h2>
            {topViewed.length ? (
              <ol className="flex flex-col gap-2">
                {topViewed.map(([pid, n]) => (
                  <li key={pid} className="flex justify-between gap-2 type-small">
                    <span className="truncate text-ink">{names.get(pid) ?? `Product #${pid}`}</span>
                    <span className="shrink-0 text-ink-muted">{n} customers</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="type-small text-ink-muted">Nothing yet.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-1">
            <span className="type-small text-ink-muted">Follow-ups waiting</span>
            <span className="type-h2 text-ink">{followups ?? 0}</span>
            <span className="type-caption text-ink-muted">Lingo checks in {tenant.followup_hours} h after the last reply.</span>
          </Card>
        </div>
      </div>
    </div>
  );
}
