import { Card, cn, formatDate, formatPrice } from "@retexia/ui";
import { PageHeader, StatCard } from "@retexia/ui/admin";
import Link from "next/link";
import { OrderStatus, ProductTag } from "@/components/common/status";
import { DashboardCharts } from "@/components/dashboard/charts";
import { requireStaffPage } from "@/lib/auth";
import { param, withParams, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Dashboard" };

const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
] as const;

type Dash = {
  new_requests: number;
  waiting_for_action: number;
  active_subscriptions: number;
  mrr: number;
  revenue: number;
  setup_fees: number;
  renewals_due: number;
  overdue_renewals: number;
  new_customers: number;
  unread_messages: number;
  waitlist_signups: number;
  weekly: { week: string; requests: number; revenue: number }[];
  mrr_by_product: { product_id: string; slug: string; name: string; color: string; mrr: number; active: number }[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaffPage("view");
  const range = RANGES.find((r) => r.key === param(sp, "range")) ?? RANGES[1];
  const { data: products } = await supabase.from("products").select("id, slug, short_name").order("sort_order");
  const product = (products ?? []).find((p) => p.slug === param(sp, "product"));
  const to = new Date();
  const from = new Date(to.getTime() - (range.days - 1) * 86_400_000);
  const soon = new Date(to.getTime() + 7 * 86_400_000).toISOString();

  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) => (product ? q.eq("product_id", product.id) : q);
  const [{ data: dash }, waiting, renewals, proofs, messages, settings] = await Promise.all([
    supabase.rpc("admin_dashboard", { p_product_id: product?.id, p_from: day(from), p_to: day(to) }),
    scoped(supabase.from("staff_orders").select("id, ref, status, status_label, status_tone, customer_name, customer_business, product_slug, product_short_name, created_at").in("status", ["submitted", "reviewing"])).order("created_at").limit(6),
    scoped(supabase.from("staff_orders").select("id, ref, customer_name, customer_business, product_slug, product_short_name, renews_at, price_amount, currency").eq("status", "active").lt("renews_at", soon)).order("renews_at").limit(6),
    supabase.from("staff_payments").select("id, order_ref, customer_name, customer_business, amount, currency, created_at, product_slug").eq("status", "pending").order("created_at").limit(6),
    supabase.from("contact_messages").select("id, name, subject, message, created_at").eq("status", "new").order("created_at", { ascending: false }).limit(5),
    supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  const d = (dash ?? {}) as Partial<Dash>;
  const currency = settings.data?.currency_code ?? "LKR";
  const hour = Number(new Intl.DateTimeFormat("en-LK", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Colombo" }).format(to));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const pendingProofs = (proofs.data ?? []).filter((p) => !product || p.product_slug === product.slug);

  const chip = (active: boolean) => cn("inline-flex h-8 items-center rounded-full px-3 type-label transition-hover focus-visible:focus-ring", active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk hover:text-ink");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${greeting}${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`} description="What needs you today, and how the business is doing." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Product" className="flex flex-wrap gap-1">
          <Link href={withParams("/", sp, { product: null })} aria-current={!product ? "page" : undefined} className={chip(!product)}>
            All products
          </Link>
          {(products ?? []).map((p) => (
            <Link key={p.id} href={withParams("/", sp, { product: p.slug })} aria-current={product?.id === p.id ? "page" : undefined} className={chip(product?.id === p.id)}>
              {p.short_name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Period" className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r.key} href={withParams("/", sp, { range: r.key === "30d" ? null : r.key })} aria-current={range.key === r.key ? "page" : undefined} className={chip(range.key === r.key)}>
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Waiting for you" value={d.waiting_for_action ?? 0} href={withParams("/requests", {}, { product: product?.slug })} tone={(d.waiting_for_action ?? 0) > 0 ? "warning" : "neutral"} hint="New, in review, proofs to check, setups stuck 3+ days" />
        <StatCard label="Active subscriptions" value={d.active_subscriptions ?? 0} href={withParams("/requests", {}, { tab: "active", product: product?.slug })} />
        <StatCard label="Monthly recurring revenue" value={formatPrice(d.mrr ?? 0, currency)} hint="Yearly plans counted per month" />
        <StatCard label={`Revenue (${range.label})`} value={formatPrice(d.revenue ?? 0, currency)} hint={`${formatPrice(d.setup_fees ?? 0, currency)} in setup fees`} href={withParams("/payments", {}, { product: product?.slug })} />
        <StatCard label={`New requests (${range.label})`} value={d.new_requests ?? 0} />
        <StatCard label={`New customers (${range.label})`} value={d.new_customers ?? 0} href="/customers" />
        <StatCard label="Renewals due (7 days)" value={d.renewals_due ?? 0} tone={(d.overdue_renewals ?? 0) > 0 ? "danger" : "neutral"} hint={(d.overdue_renewals ?? 0) > 0 ? `${d.overdue_renewals} overdue` : "None overdue"} />
        <StatCard label="Unread messages" value={d.unread_messages ?? 0} href="/inbox" hint={`${d.waitlist_signups ?? 0} waitlist sign-ups (${range.label})`} />
      </div>

      <DashboardCharts weekly={d.weekly ?? []} mrr={(d.mrr_by_product ?? []).map((m) => ({ ...m, mrr: Number(m.mrr), active: Number(m.active) }))} currency={currency} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard title="Needs action" href={withParams("/requests", {}, { product: product?.slug })} empty="Nothing waiting. Nice.">
          {(waiting.data ?? []).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/requests/${encodeURIComponent(o.ref ?? "")}`} className="type-code text-link">
                  {o.ref}
                </Link>
                <ProductTag slug={o.product_slug} name={o.product_short_name} />
                <span className="type-body text-ink">{o.customer_business || o.customer_name}</span>
              </span>
              <span className="flex items-center gap-2">
                <OrderStatus label={o.status_label} tone={o.status_tone} fallback={o.status} />
                <span className="type-small text-ink-muted">{formatDate(o.created_at)}</span>
              </span>
            </li>
          ))}
        </ListCard>
        <ListCard title="Renewals due and overdue" href={withParams("/requests", {}, { tab: "active", product: product?.slug })} empty="No renewals in the next 7 days.">
          {(renewals.data ?? []).map((o) => {
            const overdue = o.renews_at && new Date(o.renews_at) < to;
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/requests/${encodeURIComponent(o.ref ?? "")}?tab=payments`} className="type-code text-link">
                    {o.ref}
                  </Link>
                  <ProductTag slug={o.product_slug} name={o.product_short_name} />
                  <span className="type-body text-ink">{o.customer_business || o.customer_name}</span>
                </span>
                <span className={cn("type-small", overdue ? "text-danger" : "text-ink-muted")}>
                  {formatPrice(o.price_amount, o.currency ?? currency)} · {overdue ? "overdue since" : "due"} {formatDate(o.renews_at)}
                </span>
              </li>
            );
          })}
        </ListCard>
        <ListCard title="Payment proofs to check" href="/payments?tab=proofs" empty="No proofs waiting.">
          {pendingProofs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/requests/${encodeURIComponent(p.order_ref ?? "")}?tab=payments`} className="type-code text-link">
                  {p.order_ref}
                </Link>
                <span className="type-body text-ink">{p.customer_business || p.customer_name}</span>
              </span>
              <span className="type-small text-ink-muted">
                {formatPrice(p.amount, p.currency ?? currency)} · {formatDate(p.created_at)}
              </span>
            </li>
          ))}
        </ListCard>
        <ListCard title="New messages" href="/inbox" empty="Inbox zero.">
          {(messages.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-col gap-0.5 px-5 py-3">
              <Link href={`/inbox?open=${m.id}`} className="type-label text-ink hover:text-brand">
                {m.name}
              </Link>
              <span className="truncate type-small text-ink-muted">{m.subject || m.message}</span>
            </li>
          ))}
        </ListCard>
      </div>
    </div>
  );
}

function ListCard({ title, href, empty, children }: { title: string; href: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card padded={false} className="self-start">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="type-h3 text-ink">{title}</h2>
        <Link href={href} className="type-label text-link">
          View all
        </Link>
      </div>
      {children.length ? <ul className="divide-y divide-line">{children}</ul> : <p className="px-5 py-8 text-center type-body text-ink-muted">{empty}</p>}
    </Card>
  );
}
