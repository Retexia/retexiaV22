import { Button, Card } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { ActivityChart } from "@/components/lingo/activity-chart";
import { lingoContext, overview } from "@/lib/feeder/lingo/data";
import { LEVELS, money, ROUTE, usd } from "@/lib/feeder/lingo/labels";

const LEVEL_COLOR = ["var(--rx-success)", "var(--rx-brand)", "var(--product-feeder, var(--rx-brand))", "var(--rx-warning)", "var(--rx-danger)"];

export default async function LingoDashboard() {
  const { ctx } = await lingoContext("/lingo");
  if (!ctx) return null;
  const o = await overview(ctx.id, 30);
  const levels = LEVELS.map((l) => ({ ...l, n: Object.entries(o.routes).filter(([r]) => ROUTE[r]?.level === l.level).reduce((s, [, n]) => s + Number(n), 0) }));
  const turns = levels.reduce((s, l) => s + l.n, 0);
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const conv = pct(o.orders_period, o.chats_period);
  const cacheRate = pct(Number(o.routes.cache ?? 0), Number(o.routes.cache ?? 0) + Number(o.routes.ai ?? 0));
  const ruleRate = pct(Number(o.routes.rule ?? 0) + Number(o.routes.tap ?? 0), turns);
  const noReplyAi = pct(turns - Number(o.routes.ai ?? 0), turns);
  const perChat = o.chats_period ? o.ai_period / o.chats_period : 0;
  const perOrder = o.orders_period ? o.ai_period / o.orders_period : 0;
  const used = Math.min(100, pct(o.budget.used, o.budget.limit || 1));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Chats today" value={o.chats_today} hint={`${o.new_today} new`} href="/lingo/inbox" />
        <StatCard label="Orders today" value={o.orders_today} hint={`${o.orders_period} in 30 days · ${money(o.sales_period)}`} href="/lingo/orders" tone={o.orders_today ? "success" : "neutral"} />
        <StatCard label="Conversion (30 days)" value={`${conv}%`} hint={`${o.orders_period} orders from ${o.chats_period} chats`} />
        <StatCard label="Needs you" value={o.needs_you} hint="Chats handed to you" href="/lingo/inbox?f=needs" tone={o.needs_you ? "danger" : "neutral"} />
      </div>
      {o.to_export ? (
        <Card className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="type-body text-ink">
            <strong>{o.to_export}</strong> confirmed order{o.to_export === 1 ? "" : "s"} waiting for your courier file.
          </p>
          <Button href="/lingo/orders?f=export" size="sm">Open orders</Button>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3 text-ink">Customer messages and orders</h2>
          <p className="type-small text-ink-muted">Last 14 days (test chats not counted).</p>
        </div>
        <ActivityChart days={o.daily.map((d) => ({ day: String(d.day), customer_messages: Number(d.messages), orders: Number(d.orders) }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="type-h3 text-ink">How Lingo answered (30 days)</h2>
            <p className="type-small text-ink-muted">{turns} replies. The lower the level, the cheaper and faster.</p>
          </div>
          {turns ? (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunk" role="img" aria-label={levels.map((l) => `${l.label}: ${pct(l.n, turns)}%`).join(", ")}>
                {levels.map((l) => (l.n ? <span key={l.level} style={{ width: `${pct(l.n, turns)}%`, background: LEVEL_COLOR[l.level] }} /> : null))}
              </div>
              <ul className="flex flex-col gap-2">
                {levels.map((l) => (
                  <li key={l.level} className="flex items-center justify-between gap-3 type-small">
                    <span className="flex items-center gap-2 text-ink">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: LEVEL_COLOR[l.level] }} />
                      {l.label}
                      <span className="text-ink-muted">{l.hint}</span>
                    </span>
                    <span className="text-ink tabular-nums">
                      {l.n} · {pct(l.n, turns)}%
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3 type-small">
                <div><dt className="text-ink-muted">Quick rules + taps</dt><dd className="type-h3 text-ink">{ruleRate}%</dd></div>
                <div><dt className="text-ink-muted">Saved-answer hits</dt><dd className="type-h3 text-ink">{cacheRate}%</dd></div>
                <div><dt className="text-ink-muted">No reply AI needed</dt><dd className="type-h3 text-ink">{noReplyAi}%</dd></div>
              </dl>
            </>
          ) : (
            <p className="type-body text-ink-muted">No replies yet. Try the Test bot, or connect your number.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="type-h3 text-ink">AI allowance</h2>
            <p className="type-small text-ink-muted">Included in your monthly price. When it&apos;s used up, Lingo keeps answering without the reply AI.</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between type-small">
              <span className="text-ink">This month: {usd(o.budget.used, 3)}</span>
              <span className="text-ink-muted">of {usd(o.budget.limit)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunk" role="img" aria-label={`${used}% of this month's AI allowance used`}>
              <span className="block h-full rounded-full" style={{ width: `${used}%`, background: used >= 100 ? "var(--rx-danger)" : used >= 80 ? "var(--rx-warning)" : "var(--rx-success)" }} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 type-small sm:grid-cols-4">
            <div><dt className="text-ink-muted">Today</dt><dd className="type-h3 text-ink">{usd(o.ai_today, 3)}</dd></div>
            <div><dt className="text-ink-muted">Per chat</dt><dd className="type-h3 text-ink">{usd(perChat, 4)}</dd></div>
            <div><dt className="text-ink-muted">Per order</dt><dd className="type-h3 text-ink">{usd(perOrder, 4)}</dd></div>
            <div><dt className="text-ink-muted">Paid WhatsApp msgs</dt><dd className="type-h3 text-ink">{o.billable}</dd></div>
          </dl>
          <p className="type-small text-ink-muted">
            Paid WhatsApp messages are charged by Meta to your own WhatsApp account. Chats from Click-to-WhatsApp ads are free, and the first 1,000 service messages each month are free.
          </p>
        </Card>
      </div>
    </div>
  );
}
