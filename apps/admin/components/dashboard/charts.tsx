"use client";

import { Card } from "@retexia/ui";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Weekly = { week: string; requests: number; revenue: number };
type ProductMrr = { slug: string; name: string; color: string; mrr: number; active: number };

const axis = { stroke: "var(--rx-ink-muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--rx-surface-raised)", border: "1px solid var(--rx-line)", borderRadius: 12, color: "var(--rx-ink)", fontSize: 13 },
  labelStyle: { color: "var(--rx-ink-muted)" },
  cursor: { fill: "var(--rx-surface-sunk)" },
};
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const weekLabel = (w: string) => new Date(`${w}T00:00:00`).toLocaleDateString("en-LK", { day: "numeric", month: "short" });

function Empty({ text }: { text: string }) {
  return <p className="flex h-56 items-center justify-center type-body text-ink-muted">{text}</p>;
}

export function DashboardCharts({ weekly, mrr, currency }: { weekly: Weekly[]; mrr: ProductMrr[]; currency: string }) {
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString("en-LK")}`;
  const hasWeekly = weekly.some((w) => w.requests || w.revenue);
  const hasMrr = mrr.some((m) => m.mrr);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="flex flex-col gap-3 lg:col-span-2">
        <h2 className="type-h3 text-ink">Revenue by week</h2>
        {hasWeekly ? (
          <div className="h-56" role="img" aria-label={`Revenue by week: ${weekly.map((w) => `${weekLabel(w.week)} ${money(w.revenue)}`).join(", ")}`}>
            <ResponsiveContainer>
              <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke="var(--rx-line)" />
                <XAxis dataKey="week" tickFormatter={weekLabel} {...axis} />
                <YAxis tickFormatter={short} {...axis} width={44} />
                <Tooltip {...tooltipStyle} labelFormatter={(w) => `Week of ${weekLabel(String(w))}`} formatter={(v) => [money(Number(v)), "Revenue"]} />
                <Bar dataKey="revenue" fill="var(--rx-brand)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty text="No payments in this period." />
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Monthly recurring by product</h2>
        {hasMrr ? (
          <div className="h-56" role="img" aria-label={`Monthly recurring revenue: ${mrr.map((m) => `${m.name} ${money(m.mrr)}`).join(", ")}`}>
            <ResponsiveContainer>
              <BarChart data={mrr} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis type="number" tickFormatter={short} {...axis} />
                <YAxis type="category" dataKey="name" {...axis} width={64} />
                <Tooltip {...tooltipStyle} formatter={(v, _n, p) => [`${money(Number(v))} · ${(p.payload as ProductMrr).active} active`, "MRR"]} />
                <Bar dataKey="mrr" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {mrr.map((m) => (
                    <Cell key={m.slug} fill={`var(--product-${m.slug}, ${m.color})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty text="No active subscriptions yet." />
        )}
      </Card>
      <Card className="flex flex-col gap-3 lg:col-span-3">
        <h2 className="type-h3 text-ink">New requests by week</h2>
        {hasWeekly ? (
          <div className="h-48" role="img" aria-label={`New requests by week: ${weekly.map((w) => `${weekLabel(w.week)} ${w.requests}`).join(", ")}`}>
            <ResponsiveContainer>
              <LineChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="var(--rx-line)" />
                <XAxis dataKey="week" tickFormatter={weekLabel} {...axis} />
                <YAxis allowDecimals={false} {...axis} width={40} />
                <Tooltip {...tooltipStyle} labelFormatter={(w) => `Week of ${weekLabel(String(w))}`} formatter={(v) => [v, "Requests"]} />
                <Line type="monotone" dataKey="requests" stroke="var(--rx-brand)" strokeWidth={2} dot={{ r: 3, fill: "var(--rx-brand)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty text="No requests in this period." />
        )}
      </Card>
    </div>
  );
}
