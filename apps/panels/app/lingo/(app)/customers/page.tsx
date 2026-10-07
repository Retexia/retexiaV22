import { Badge, Card, StatusBadge, cn, formatDate } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import Link from "next/link";
import type { CustomerStats } from "@/lib/lingo/db.types";
import { LANG_LABEL, STAGE, displayName, money, stageOf, type Stage } from "@/lib/lingo/labels";
import { requireLingoPage } from "@/lib/lingo/session";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { tenant, db } = await requireLingoPage("/customers");
  const [{ data: customers }, stats, { data: products }] = await Promise.all([
    db.from("customers").select("id, customer_name, whatsapp_name, number, language, seen_products, selected_product, bot_paused, last_customer_msg_at, created_at").eq("lingo_user_id", tenant.id).order("last_customer_msg_at", { ascending: false, nullsFirst: false }).limit(2000),
    db.rpc("panel_customer_stats", { p_user: tenant.id }),
    db.from("products").select("id, product_name").eq("lingo_user_id", tenant.id),
  ]);
  const byId = new Map(((stats.data ?? []) as CustomerStats[]).map((s) => [Number(s.customer_id), s]));
  const names = new Map((products ?? []).map((p) => [p.id, p.product_name]));
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const stageFilter = typeof sp.stage === "string" && sp.stage in STAGE ? (sp.stage as Stage) : null;
  const sort = sp.sort === "spent" ? "spent" : "recent";
  const rows = (customers ?? [])
    .map((c) => {
      const s = byId.get(c.id);
      return { c, s, stage: stageOf(c, s), name: displayName(c) };
    })
    .filter((r) => !stageFilter || r.stage === stageFilter)
    .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.c.number ?? "").includes(q))
    .sort((a, b) => (sort === "spent" ? Number(b.s?.spent ?? 0) - Number(a.s?.spent ?? 0) : 0));
  const counts = (customers ?? []).reduce<Record<string, number>>((m, c) => {
    const st = stageOf(c, byId.get(c.id));
    m[st] = (m[st] ?? 0) + 1;
    return m;
  }, {});
  const link = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const merged = { stage: stageFilter, q: q || null, sort: sort === "recent" ? null : sort, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return u.size ? `/customers?${u}` : "/customers";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" description={`Everyone who messaged ${tenant.business_name} on WhatsApp, and where they are: just asking, interested, about to order, or buying.`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Stage" className="flex flex-wrap gap-1">
          <Link href={link({ stage: null })} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 type-label", !stageFilter ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}>
            All <span className="type-small">{customers?.length ?? 0}</span>
          </Link>
          {(Object.keys(STAGE) as Stage[]).map((st) => (
            <Link key={st} href={link({ stage: st })} title={STAGE[st].hint} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 type-label", stageFilter === st ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}>
              {STAGE[st].label} <span className="type-small">{counts[st] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form method="get" action="/customers" className="flex gap-2">
          {stageFilter ? <input type="hidden" name="stage" value={stageFilter} /> : null}
          <input name="q" type="search" defaultValue={q} aria-label="Search customers" placeholder="Name or number" className="h-9 w-48 rounded-full border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring" />
          <select name="sort" defaultValue={sort} aria-label="Sort" className="h-9 rounded-full border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:focus-ring">
            <option value="recent">Latest first</option>
            <option value="spent">Spent most</option>
          </select>
          <button type="submit" className="h-9 rounded-full border border-line-strong px-3 type-label text-ink hover:bg-surface-sunk focus-visible:focus-ring">
            Go
          </button>
        </form>
      </div>
      {rows.length ? (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {rows.slice(0, 500).map(({ c, s, stage, name }) => {
              const interest = c.selected_product ? names.get(c.selected_product) : c.seen_products?.length ? names.get(c.seen_products[c.seen_products.length - 1]!) : null;
              return (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`} className="grid gap-2 px-5 py-3 hover:bg-surface-sunk focus-visible:focus-ring md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2 truncate type-label text-ink">
                        {name}
                        {c.bot_paused ? <Badge tone="warning">Lingo stopped</Badge> : null}
                      </span>
                      <span className="type-small text-ink-muted">
                        {c.number ? `+${c.number}` : ""}
                        {c.language ? ` · ${LANG_LABEL[c.language]}` : ""}
                      </span>
                    </span>
                    <span className="truncate type-small text-ink-muted">{interest ? `Interested in ${interest}` : `${s?.user_messages ?? 0} messages`}</span>
                    <span className="type-small text-ink-muted">
                      {s?.confirmed_orders ? `${s.confirmed_orders} order${s.confirmed_orders === 1 ? "" : "s"} · ${money(s.spent)}` : "No orders yet"}
                      <br />
                      {c.last_customer_msg_at ? `Last message ${formatDate(c.last_customer_msg_at)}` : ""}
                    </span>
                    <StatusBadge tone={STAGE[stage].tone} label={STAGE[stage].label} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="type-body text-ink-muted">No customers here yet.</p>
        </Card>
      )}
    </div>
  );
}
