import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";
import { can } from "@retexia/supabase";
import { Alert, Badge, Card, EmptyState } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { MessageCircle } from "lucide-react";
import type { HubTabContext } from "../registry";
import { CatalogImport, LfSellerControls, LfSettingsForm, PriceRow } from "./lingo-feeder-controls";

type SellerRow = {
  user_id: string; business: string; status: string; budget: number | null; plan: string | null; billing_cycle: string | null; mrr_lkr: number; paid_lkr: number;
  ai_usd: number; ai_test_usd: number; ai_by_task: Record<string, number>; ai_by_provider: Record<string, number>; chats: number; orders: number; sales_lkr: number;
};
type Profit = {
  from: string; to: string; usd_to_lkr: number;
  money: { usd_to_lkr?: number; fixed_costs_lkr?: number; payment_fee_pct?: number; target_margin_pct?: number };
  allowance: { usd?: number; cheap_until?: number };
  ai: Record<string, string | boolean>;
  price: { monthly: number; yearly: number } | null;
  sellers: SellerRow[]; unmatched_ads: number;
  events: { type: string; user_id: string | null; detail: Record<string, unknown>; at: string }[];
};

const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-US")}`;
const usd = (n: number, d = 2) => `US$${Number(n ?? 0).toFixed(d)}`;
const ago = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });
const monthName = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Colombo" });

function analyse(p: Profit) {
  const rate = Number(p.money.usd_to_lkr ?? p.usd_to_lkr ?? 300);
  const fee = Number(p.money.payment_fee_pct ?? 3) / 100;
  const target = Number(p.money.target_margin_pct ?? 60) / 100;
  const fixed = Number(p.money.fixed_costs_lkr ?? 0);
  const price = Number(p.price?.monthly ?? 0);
  const paying = p.sellers.filter((s) => s.plan && s.plan !== "trial");
  const counted = Math.max(1, p.sellers.filter((s) => s.plan).length);
  const fixedShare = fixed / counted;
  const rows = p.sellers.map((s) => {
    const ai = s.ai_usd * rate;
    const feeLkr = s.paid_lkr * fee;
    return { ...s, ai_lkr: ai, fee_lkr: feeLkr, profit: s.paid_lkr - ai - feeLkr - (s.plan ? fixedShare : 0), per_chat: s.chats ? s.ai_usd / s.chats : 0 };
  });
  const paid = rows.reduce((a, s) => a + s.paid_lkr, 0);
  const aiLkr = rows.reduce((a, s) => a + s.ai_lkr, 0);
  const fees = rows.reduce((a, s) => a + s.fee_lkr, 0);
  const profit = paid - aiLkr - fees - fixed;
  const chats = rows.reduce((a, s) => a + s.chats, 0);
  const aiUsd = rows.reduce((a, s) => a + s.ai_usd - s.ai_test_usd, 0);
  const perChat = chats >= 20 ? aiUsd / chats : 0.003;                       // measured, or the planning estimate
  const active = rows.filter((s) => s.chats > 0);
  const avgAi = active.length ? active.reduce((a, s) => a + s.ai_lkr, 0) / active.length : 1000 * perChat * rate;
  const maxAi = active.length ? Math.max(...active.map((s) => s.ai_lkr)) : 3000 * perChat * rate;
  const cap = Number(p.allowance.usd ?? 10) * Number(p.allowance.cheap_until ?? 2) * rate;
  return {
    rate, fee, target, fixed, fixedShare, price, rows, paid, aiLkr, fees, profit, chats, perChat, avgAi, maxAi, cap, paying: paying.length,
    mrr: rows.reduce((a, s) => a + s.mrr_lkr, 0),
    suggested: Math.ceil(((avgAi + fixedShare) / Math.max(0.05, 1 - fee - target)) / 100) * 100,
    breakEvenWorst: Math.ceil((cap + fixedShare) / (1 - fee)),
    at: (n: number) => n * perChat * rate,
  };
}

/** Products → Feeder → Lingo Feeder: is each seller profitable, what the AI costs, the price check, models and the catalogue. */
export async function FeederLingoFeederTab({ staff }: HubTabContext) {
  const db = createAdminSchemaClient("lingo_feeder");
  const prev = new Date();
  prev.setUTCDate(1);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const [{ data: now, error }, { data: last }, { data: prices }, { count: products }, { count: pictures }] = await Promise.all([
    db.rpc("admin_profit", { p_month: null }),
    db.rpc("admin_profit", { p_month: prev.toISOString().slice(0, 10) }),
    db.from("model_prices").select("*").order("provider").order("model"),
    db.from("products").select("product_id", { count: "exact", head: true }),
    db.from("products").select("product_id", { count: "exact", head: true }).not("picture_url", "is", null),
  ]);
  if (error || !now) {
    return (
      <Alert tone="danger" title="Can't read Lingo Feeder">
        {error?.message ?? "No data"}. Run migrations 0039 and 0040, and add <code>lingo_feeder</code> to Supabase → Settings → Data API → Exposed schemas.
      </Alert>
    );
  }
  const p = now as Profit;
  const a = analyse(p);
  const l = last ? analyse(last as Profit) : null;
  const ids = [...new Set(p.sellers.map((s) => s.user_id))];
  const { data: people } = ids.length ? await createAdminClient().from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
  const who = (id: string) => (people ?? []).find((x) => x.id === id);
  const canManage = can(staff.role, "manageCustomers");
  const byProvider = p.sellers.reduce<Record<string, number>>((acc, s) => { for (const [k, v] of Object.entries(s.ai_by_provider)) acc[k] = (acc[k] ?? 0) + Number(v); return acc; }, {});
  const byTask = p.sellers.reduce<Record<string, number>>((acc, s) => { for (const [k, v] of Object.entries(s.ai_by_task)) acc[k] = (acc[k] ?? 0) + Number(v); return acc; }, {});
  const verdict = a.price >= a.suggested ? "success" : a.price >= a.breakEvenWorst ? "warning" : "danger";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Money in · ${monthName(p.from)}`} value={rs(a.paid)} hint={`${a.paying} paying · MRR ${rs(a.mrr)}`} />
        <StatCard label="AI cost this month" value={rs(a.aiLkr)} hint={`${usd(a.aiLkr / a.rate)} · OpenAI ${usd(byProvider.openai ?? 0)} · Gemini ${usd(byProvider.gemini ?? 0)}`} />
        <StatCard label="Profit this month" value={rs(a.profit)} hint={`after AI, ${rs(a.fixed)} fixed costs and ${Math.round(a.fee * 100)}% payment fees${l ? ` · last month ${rs(l.profit)}` : ""}`} tone={a.profit >= 0 ? "success" : "danger"} />
        <StatCard label="AI cost per customer chat" value={usd(a.perChat, 4)} hint={a.chats >= 20 ? `measured over ${a.chats} chats (${rs(a.perChat * a.rate)})` : "planning estimate until 20 real chats"} />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="type-h3 text-ink">Price check</h2>
          <Badge tone={verdict}>{verdict === "success" ? "Price keeps the target margin" : verdict === "warning" ? "Profitable, below the target margin" : "Price too low for a heavy seller"}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="type-small text-ink-muted">Current price</p><p className="type-h3 text-ink">{rs(a.price)} / month</p></div>
          <div><p className="type-small text-ink-muted">Price for a {Math.round(a.target * 100)}% margin (typical seller)</p><p className="type-h3 text-ink">{rs(a.suggested)}</p></div>
          <div><p className="type-small text-ink-muted">Break-even, heaviest possible seller</p><p className="type-h3 text-ink">{rs(a.breakEvenWorst)}</p></div>
          <div><p className="type-small text-ink-muted">Fixed costs per seller</p><p className="type-h3 text-ink">{rs(a.fixedShare)}</p></div>
        </div>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-small text-ink-muted">
          <li>A typical seller costs {rs(a.avgAi)} of AI a month{a.rows.some((s) => s.chats) ? "" : " (estimate: 1,000 chats)"}; the heaviest {rs(a.maxAi)}.</li>
          <li>At {usd(a.perChat, 4)} per chat: 1,000 chats ≈ {rs(a.at(1000))}, 3,000 chats ≈ {rs(a.at(3000))}, 6,000 chats ≈ {rs(a.at(6000))} of AI.</li>
          <li>Nobody can cost more than {rs(a.cap)} of AI: the allowance is US${Number(p.allowance.usd ?? 10)} at full AI, then the cheaper model up to {Number(p.allowance.cheap_until ?? 2)}× it, then fixed texts only.</li>
          <li>WhatsApp fees are paid by each seller to Meta (chats from Click-to-WhatsApp ads are free), so they aren&apos;t a Retexia cost.</li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Sellers · {monthName(p.from)}</h2>
        {a.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-line text-left type-small text-ink-muted">
                  <th className="py-2 pr-3 font-normal">Seller</th><th className="py-2 pr-3 font-normal">Chats</th><th className="py-2 pr-3 font-normal">Orders</th>
                  <th className="py-2 pr-3 font-normal">AI</th><th className="py-2 pr-3 font-normal">Per chat</th><th className="py-2 pr-3 font-normal">Paid</th>
                  <th className="py-2 pr-3 font-normal">Profit</th><th className="py-2 font-normal">Allowance · status</th>
                </tr>
              </thead>
              <tbody>
                {a.rows.map((s) => (
                  <tr key={s.user_id} className="border-b border-line align-top last:border-b-0">
                    <td className="py-3 pr-3">
                      <p className="type-label text-ink">{s.business}</p>
                      <p className="type-caption text-ink-muted">{who(s.user_id)?.email ?? s.user_id.slice(0, 8)} · {s.plan ?? "no plan"}{s.billing_cycle === "yearly" ? " (yearly)" : ""}</p>
                    </td>
                    <td className="py-3 pr-3 type-small text-ink">{s.chats}</td>
                    <td className="py-3 pr-3 type-small text-ink">{s.orders}<span className="block type-caption text-ink-muted">{rs(s.sales_lkr)}</span></td>
                    <td className="py-3 pr-3 type-small text-ink">{rs(s.ai_lkr)}<span className="block type-caption text-ink-muted">{usd(s.ai_usd, 3)}{s.ai_test_usd ? ` · test ${usd(s.ai_test_usd, 3)}` : ""}</span></td>
                    <td className="py-3 pr-3 type-small text-ink">{s.chats ? usd(s.per_chat, 4) : "—"}</td>
                    <td className="py-3 pr-3 type-small text-ink">{rs(s.paid_lkr)}</td>
                    <td className={`py-3 pr-3 type-small ${s.profit >= 0 ? "text-success" : "text-danger"}`}>{rs(s.profit)}</td>
                    <td className="py-3"><LfSellerControls userId={s.user_id} budget={s.budget} status={s.status} disabled={!canManage} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<MessageCircle aria-hidden size={22} strokeWidth={1.5} />} title="No Lingo Feeder sellers yet">Sellers appear when a Feeder customer with Lingo Feeder opens feeder.retexia.com/lingo-feeder.</EmptyState>
        )}
        <p className="type-caption text-ink-muted">
          AI by task: {Object.entries(byTask).map(([k, v]) => `${k} ${usd(v, 3)}`).join(" · ") || "none"}. Profit = money in − AI − payment fees − fixed costs shared by sellers with a plan.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Models, allowance and money</h2>
        <LfSettingsForm ai={p.ai} allowance={p.allowance} money={p.money} disabled={!canManage} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">AI prices (US$ per 1M tokens)</h2>
          <p className="type-small text-ink-muted">Keep them the same as openai.com/api/pricing and ai.google.dev/pricing. Every call&apos;s cost is worked out from these.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-line text-left type-small text-ink-muted">
                  <th className="py-2 pr-2 font-normal">Model</th><th className="py-2 pr-2 font-normal">Input</th><th className="py-2 pr-2 font-normal">Cached</th><th className="py-2 pr-2 font-normal">Output</th><th className="py-2 pr-2 font-normal">Audio</th><th />
                </tr>
              </thead>
              <tbody>{(prices ?? []).map((row) => <PriceRow key={row.model} row={row} disabled={!canManage} />)}</tbody>
            </table>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Product catalogue</h2>
          <p className="type-small text-ink-muted">
            {products ?? 0} products, {pictures ?? 0} with a photo. Every seller sells these with their own business details. Upload the finished-descriptions CSV to update them
            (photos without a link in the file are kept; FAQs added in Supabase are kept).
          </p>
          <CatalogImport disabled={!canManage} />
          {p.unmatched_ads ? <p className="type-small text-warning">{p.unmatched_ads} ads have no product yet (sellers pick them in Products).</p> : null}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Problems (7 days)</h2>
        {p.events.length ? (
          <ul className="flex flex-col gap-1 type-small">
            {p.events.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-2">
                <Badge tone={e.type === "allowance_used" ? "warning" : "danger"}>{e.type.replace(/_/g, " ")}</Badge>
                <span className="text-ink-muted">{ago(e.at)} · {e.user_id ? (a.rows.find((s) => s.user_id === e.user_id)?.business ?? "seller") : "no seller"} · {String(e.detail?.error ?? e.detail?.model ?? e.detail?.phone_number_id ?? "").slice(0, 140)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-ink-muted">Nothing.</p>
        )}
      </Card>
    </div>
  );
}
