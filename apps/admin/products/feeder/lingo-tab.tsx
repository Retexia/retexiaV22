import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";
import { can } from "@retexia/supabase";
import { Alert, Badge, Card, EmptyState } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { MessageCircle } from "lucide-react";
import type { HubTabContext } from "../registry";
import { PriceRow, SellerControls, SharedContentButton } from "./lingo-controls";

type Seller = {
  lingo_user_id: number; user_id: string; business: string; status: string; budget: number; created_at: string;
  number: { display_phone: string | null; phone_number_id: string; status: string; problem: string | null; last_webhook_at: string | null; quality_rating: string | null } | null;
  chats_30d: number; orders_30d: number; needs_you: number; ai: { used: number; limit: number; warn: boolean; degrade: boolean };
};
type Report = {
  ai_month: number; ai_period: number; by_stage: Record<string, number>; routes: Record<string, number>;
  top_ai_questions: { q: string; n: number }[]; events: { type: string; lingo_user_id: number | null; detail: Record<string, unknown>; at: string }[];
};
const NUMBER_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = { pending: "warning", connected: "success", problem: "danger", disabled: "neutral" };
const usd = (n: number, d = 2) => `US$${Number(n ?? 0).toFixed(d)}`;
const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" }) : "never");

/** Products → Feeder → Lingo: every seller (number, chats, orders, AI against the allowance), Gemini prices, shared product content, the weekly report. */
export async function FeederLingoTab({ staff }: HubTabContext) {
  const db = createAdminSchemaClient("lingo");
  const [{ data: sellers, error }, { data: report }, { data: prices }, { data: content }, { data: products }] = await Promise.all([
    db.rpc("admin_sellers"),
    db.rpc("admin_report", { p_days: 7 }),
    db.from("model_prices").select("*").order("model"),
    db.from("product_content").select("*"),
    createAdminSchemaClient("feeder").from("products").select("product_id, product_name, active").eq("active", true).order("product_name"),
  ]);
  const list = (sellers ?? []) as Seller[];
  const r = (report ?? null) as Report | null;
  const ids = [...new Set(list.map((s) => s.user_id))];
  const { data: people } = ids.length ? await createAdminClient().from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
  const who = (id: string) => (people ?? []).find((p) => p.id === id);
  const canManage = can(staff.role, "manageCustomers");
  const turns = Object.values(r?.routes ?? {}).reduce((a, b) => a + Number(b), 0);
  const noAi = turns ? Math.round(((turns - Number(r?.routes.ai ?? 0)) / turns) * 100) : 0;
  const byFeeder = new Map((content ?? []).map((c) => [Number(c.product_id_feeder), c]));
  const sold = (products ?? []) as { product_id: number; product_name: string }[];

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert tone="danger" title="Can't read Lingo">
          {error.message}. Run migration 0037_feeder_lingo.sql and check that <code>lingo</code> is in Supabase → Settings → API → Exposed schemas.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sellers" value={String(list.length)} hint={`${list.filter((s) => s.status === "live").length} switched on`} />
        <StatCard label="AI this month" value={usd(r?.ai_month ?? 0)} hint={`${usd(r?.ai_period ?? 0)} in the last 7 days`} />
        <StatCard label="Replies without reply AI (7 days)" value={`${noAi}%`} hint="Target: at least 50%" tone={noAi >= 50 || !turns ? "success" : "warning"} />
        <StatCard label="Numbers with a problem" value={String(list.filter((s) => s.number?.status === "problem").length)} tone={list.some((s) => s.number?.status === "problem") ? "danger" : "neutral"} />
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Sellers</h2>
        {list.length ? (
          <ul className="flex flex-col">
            {list.map((s) => {
              const p = who(s.user_id);
              return (
                <li key={s.lingo_user_id} className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 xl:flex-row xl:items-end xl:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="type-label text-ink">{s.business}</span>
                      <span className="type-small text-ink-muted">#{s.lingo_user_id} · {p?.email ?? s.user_id}</span>
                      {s.number ? <Badge tone={NUMBER_TONE[s.number.status] ?? "neutral"}>{s.number.display_phone || s.number.phone_number_id} · {s.number.status}</Badge> : <Badge tone="neutral">No number</Badge>}
                      {s.ai.degrade ? <Badge tone="danger">AI allowance used up</Badge> : s.ai.warn ? <Badge tone="warning">80% of allowance</Badge> : null}
                    </p>
                    <p className="type-small text-ink-muted">
                      {s.chats_30d} chats · {s.orders_30d} orders (30 days) · {s.needs_you} waiting for them · AI {usd(s.ai.used, 3)} of {usd(s.ai.limit)} this month
                      {s.number ? ` · last webhook ${ago(s.number.last_webhook_at)}${s.number.quality_rating ? ` · quality ${s.number.quality_rating}` : ""}` : ""}
                    </p>
                    {s.number?.problem ? <p className="type-small text-danger">{s.number.problem}</p> : null}
                  </div>
                  <SellerControls id={s.lingo_user_id} budget={Number(s.budget)} status={s.status} disabled={!canManage} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<MessageCircle aria-hidden size={22} strokeWidth={1.5} />} title="No Lingo sellers yet">Sellers appear when a Feeder customer with Lingo opens feeder.retexia.com/lingo.</EmptyState>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Weekly report</h2>
          <p className="type-small text-ink-muted">AI cost by stage (7 days): {Object.entries(r?.by_stage ?? {}).map(([k, v]) => `${k} ${usd(Number(v), 4)}`).join(" · ") || "none"}</p>
          <h3 className="type-label text-ink">Questions the reply AI answered most (make them shared FAQs)</h3>
          {r?.top_ai_questions.length ? (
            <ol className="flex list-decimal flex-col gap-1 pl-5 type-small text-ink">
              {r.top_ai_questions.map((q) => <li key={q.q}>{q.q} <span className="text-ink-muted">· {q.n}×</span></li>)}
            </ol>
          ) : (
            <p className="type-small text-ink-muted">None this week.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Problems (7 days)</h2>
          {r?.events.length ? (
            <ul className="flex flex-col gap-1 type-small">
              {r.events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <Badge tone={e.type === "budget_warning" ? "warning" : "danger"}>{e.type.replace(/_/g, " ")}</Badge>
                  <span className="text-ink-muted">{ago(e.at)} · {e.lingo_user_id ? `seller #${e.lingo_user_id}` : "no seller"} · {String(e.detail?.error ?? e.detail?.phone_number_id ?? "").slice(0, 120)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-small text-ink-muted">Nothing.</p>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Gemini prices (US$ per 1M tokens)</h2>
        <p className="type-small text-ink-muted">Keep these the same as ai.google.dev/pricing (paid tier). Sellers&apos; allowances and costs are worked out from them.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line text-left type-small text-ink-muted">
                <th className="py-2 pr-3 font-normal">Model</th><th className="py-2 pr-3 font-normal">Input</th><th className="py-2 pr-3 font-normal">Output</th><th className="py-2 pr-3 font-normal">Audio in</th><th className="py-2 pr-3 font-normal">Cached in</th><th />
              </tr>
            </thead>
            <tbody>
              {(prices ?? []).map((row) => <PriceRow key={row.model} row={row} disabled={!canManage} />)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Shared product content</h2>
        <p className="type-small text-ink-muted">What Lingo knows about each Feeder product for every seller: photo, description, usage, precautions. A seller&apos;s own text wins. {byFeeder.size} of {sold.length} products have content.</p>
        <ul className="flex max-h-[32rem] flex-col overflow-y-auto">
          {sold.map((p) => {
            const c = byFeeder.get(p.product_id);
            return (
              <li key={p.product_id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                <span className="min-w-0 truncate type-small text-ink">
                  {p.product_name} <span className="text-ink-muted">· {p.product_id}{c ? (c.picture_url ? "" : " · no photo") : " · no content"}</span>
                </span>
                <SharedContentButton productId={p.product_id} name={p.product_name} content={c ?? null} disabled={!canManage} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
