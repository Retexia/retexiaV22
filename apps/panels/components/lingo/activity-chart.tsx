"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Day = { day: string; customer_messages: number; orders: number };

const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function ActivityChart({ days }: { days: Day[] }) {
  if (!days.some((d) => d.customer_messages || d.orders)) return <p className="flex h-56 items-center justify-center type-body text-ink-muted">No messages in the last 30 days.</p>;
  return (
    <div className="h-56" role="img" aria-label={`Customer messages and orders per day, last ${days.length} days`}>
      <ResponsiveContainer>
        <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--rx-line)" />
          <XAxis dataKey="day" tickFormatter={label} stroke="var(--rx-ink-muted)" fontSize={12} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis yAxisId="m" allowDecimals={false} stroke="var(--rx-ink-muted)" fontSize={12} tickLine={false} axisLine={false} width={40} />
          <YAxis yAxisId="o" orientation="right" allowDecimals={false} stroke="var(--rx-ink-muted)" fontSize={12} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: "var(--rx-surface-raised)", border: "1px solid var(--rx-line)", borderRadius: 12, color: "var(--rx-ink)", fontSize: 13 }}
            labelFormatter={(d) => label(String(d))}
            formatter={(v, n) => [v, n === "customer_messages" ? "Customer messages" : "Orders"]}
            cursor={{ fill: "var(--rx-surface-sunk)" }}
          />
          <Bar yAxisId="m" dataKey="customer_messages" fill="var(--product-lingo, var(--rx-brand))" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Line yAxisId="o" type="monotone" dataKey="orders" stroke="var(--rx-ink)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
