import { shortDate } from "@/lib/plan/logic";

/** Days as squares (weeks as columns): the darker, the more of that day's tasks were done. */
export function Heatmap({ days }: { days: { day: string; due: number; done: number }[] }) {
  const weeks: (typeof days)[] = [];
  const firstDow = (new Date(`${days[0]?.day ?? "2026-01-05"}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const padded = [...Array.from({ length: firstDow }, () => null), ...days];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7) as typeof days);
  const shade = (d: { due: number; done: number } | null) => {
    if (!d || !d.due) return "var(--rx-surface-sunk)";
    const r = d.done / d.due;
    return r === 0 ? "var(--rx-line)" : `color-mix(in srgb, var(--rx-success, #1f9d55) ${Math.round(30 + r * 70)}%, transparent)`;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto" role="img" aria-label="Tasks done per day over the last weeks">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, j) => {
              const d = w[j] ?? null;
              return <span key={j} className="size-3.5 rounded-[3px]" style={{ background: shade(d) }} title={d ? `${shortDate(d.day)}: ${d.done} of ${d.due} done` : undefined} />;
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 type-caption text-ink-muted">
        Less
        {[null, { due: 1, done: 0 }, { due: 2, done: 1 }, { due: 1, done: 1 }].map((d, i) => (
          <span key={i} className="size-3 rounded-[3px]" style={{ background: shade(d) }} />
        ))}
        More
      </div>
    </div>
  );
}
