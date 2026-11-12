"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Tasks done per day: this week next to last week. */
export function WeekChart({ rows }: { rows: { day: string; this_week: number; last_week: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--rx-line)" />
          <XAxis dataKey="day" stroke="var(--rx-ink-muted)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} stroke="var(--rx-ink-muted)" fontSize={12} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={{ background: "var(--rx-surface-raised)", border: "1px solid var(--rx-line)", borderRadius: 12, color: "var(--rx-ink)", fontSize: 13 }} cursor={{ fill: "var(--rx-surface-sunk)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="last_week" name="Last week" fill="var(--rx-line-strong)" radius={[4, 4, 0, 0]} maxBarSize={16} />
          <Bar dataKey="this_week" name="This week" fill="var(--rx-brand)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
