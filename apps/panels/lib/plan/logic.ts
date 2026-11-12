/**
 * Retexia Plan: the shared rules (browser and server): periods, when a
 * repeating task is due, streaks, chart series and progress. Dates are
 * "YYYY-MM-DD" in the person's own time zone.
 */

/** A calendar year, month or week, or "custom": a number of days/weeks/months/years from its start. */
export type Period = "year" | "month" | "week" | "custom";
export type CalendarPeriod = Exclude<Period, "custom">;
export type LengthUnit = "day" | "week" | "month" | "year";
export type Category = "income" | "savings" | "business" | "health" | "learning" | "habit" | "custom";
export type Role = "owner" | "editor" | "viewer";

export type Goal = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  title: string;
  why: string | null;
  period: Period;
  starts_on: string;
  ends_on: string;
  length_n: number | null;
  length_unit: LengthUnit | null;
  category: Category;
  status: "active" | "done" | "dropped";
  created_at: string;
};
export type Chart = {
  id: string;
  goal_id: string;
  title: string;
  unit: string;
  x_mode: "time" | "labels";
  grain: "day" | "week" | "month";
  mode: "total" | "value";
  kind: "line" | "bar";
  target: number | null;
  sort: number;
};
export type Point = { id: string; chart_id: string; at: string; label: string | null; value: number; note: string | null; created_by: string | null };
export type Task = {
  id: string;
  goal_id: string | null;
  title: string;
  repeat: "none" | "daily" | "every" | "weekdays";
  every_n: number;
  weekdays: number[];
  starts_on: string;
  ends_on: string | null;
};

export const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: "income", label: "Income", color: "#1f9d55" },
  { value: "savings", label: "Savings", color: "#2a68d9" },
  { value: "business", label: "Business", color: "#7c4ddb" },
  { value: "health", label: "Health", color: "#e0573f" },
  { value: "learning", label: "Learning", color: "#c98a00" },
  { value: "habit", label: "Habit", color: "#0e9aa7" },
  { value: "custom", label: "Other", color: "#64748b" },
];
export const categoryOf = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1]!;

// ---------------------------------------------------------------- dates

const DAY = 86_400_000;
const toNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const fromNum = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const shift = (d: string, days: number) => fromNum(toNum(d) + days);
export const daysBetween = (a: string, b: string) => toNum(b) - toNum(a);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** The year / month / week (Monday to Sunday) that contains `day`. */
export function periodRange(period: CalendarPeriod, day: string): { starts_on: string; ends_on: string } {
  if (period === "year") return { starts_on: `${day.slice(0, 4)}-01-01`, ends_on: `${day.slice(0, 4)}-12-31` };
  if (period === "month") {
    const start = `${day.slice(0, 7)}-01`;
    const next = new Date(`${start}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { starts_on: start, ends_on: shift(next.toISOString().slice(0, 10), -1) };
  }
  const start = shift(day, -((weekday(day) + 6) % 7));
  return { starts_on: start, ends_on: shift(start, 6) };
}

export function periodLabel(g: Pick<Goal, "period" | "starts_on" | "ends_on"> & Partial<Pick<Goal, "length_n" | "length_unit">>) {
  if (g.period === "custom") {
    const sameYear = g.starts_on.slice(0, 4) === g.ends_on.slice(0, 4);
    const range = sameYear ? `${shortDate(g.starts_on)} → ${shortDate(g.ends_on)} ${g.ends_on.slice(0, 4)}` : `${shortDate(g.starts_on)} ${g.starts_on.slice(0, 4)} → ${shortDate(g.ends_on)} ${g.ends_on.slice(0, 4)}`;
    return g.length_n && g.length_unit ? `${lengthText(g.length_n, g.length_unit)} · ${range}` : range;
  }
  if (g.period === "year") return g.starts_on.slice(0, 4);
  if (g.period === "month") return `${MONTHS_LONG[Number(g.starts_on.slice(5, 7)) - 1]} ${g.starts_on.slice(0, 4)}`;
  return `Week of ${shortDate(periodRange("week", g.starts_on).starts_on)}`;
}

/**
 * When a goal starts counting (its pace line starts here). A goal for the
 * running week/month/year starts today, not on the 1st; a future one on its
 * first day. Always inside the period.
 */
export function goalStart(range: { starts_on: string; ends_on: string }, today: string, wanted?: string | null) {
  const pick = wanted || (today > range.starts_on && today <= range.ends_on ? today : range.starts_on);
  return pick < range.starts_on ? range.starts_on : pick > range.ends_on ? range.ends_on : pick;
}

/** The whole time a goal covers: its calendar year/month/week (even when it starts later in it), or its own dates. */
export const fullPeriod = (g: Pick<Goal, "period" | "starts_on" | "ends_on">) => (g.period === "custom" ? { starts_on: g.starts_on, ends_on: g.ends_on } : periodRange(g.period, g.starts_on));

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "year", label: "years" },
];
export const lengthText = (n: number, unit: LengthUnit) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** day + n months, staying on the last day when the month is shorter (31 Jan + 1 month = 28/29 Feb). */
function addMonths(day: string, n: number) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const d = Math.min(Number(day.slice(8, 10)), last);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A goal of n days/weeks/months/years from start: "30 days from 12 Nov" ends on 11 Dec. */
export function lengthRange(start: string, n: number, unit: LengthUnit): { starts_on: string; ends_on: string } {
  const next = unit === "day" ? shift(start, n) : unit === "week" ? shift(start, 7 * n) : addMonths(start, unit === "month" ? n : 12 * n);
  return { starts_on: start, ends_on: shift(next, -1) };
}

/** The chart step that suits a goal of this length: days up to 2 months, weeks up to ~7 months, then months. */
export function grainFor(range: { starts_on: string; ends_on: string }): Chart["grain"] {
  const days = daysBetween(range.starts_on, range.ends_on) + 1;
  return days <= 62 ? "day" : days <= 214 ? "week" : "month";
}

/** Which smaller goals fit inside this one (null: too short to split). */
export function smallerOf(g: Pick<Goal, "period" | "starts_on" | "ends_on">): CalendarPeriod | null {
  if (g.period === "year") return "month";
  if (g.period === "month") return "week";
  if (g.period === "week") return null;
  const days = daysBetween(g.starts_on, g.ends_on) + 1;
  return days > 62 ? "month" : days > 13 ? "week" : null;
}

/** A goal can be part of a bigger one that covers all its days and is longer. */
export function canContain(parent: Pick<Goal, "period" | "starts_on" | "ends_on">, child: { starts_on: string; ends_on: string }) {
  const full = fullPeriod(parent);
  return full.starts_on <= child.starts_on && full.ends_on >= child.ends_on && daysBetween(full.starts_on, full.ends_on) > daysBetween(child.starts_on, child.ends_on);
}

// ---------------------------------------------------------------- tasks and streaks

export function isDue(t: Task, day: string) {
  if (day < t.starts_on || (t.ends_on && day > t.ends_on)) return false;
  if (t.repeat === "none") return day === t.starts_on;
  if (t.repeat === "daily") return true;
  if (t.repeat === "every") return daysBetween(t.starts_on, day) % Math.max(1, t.every_n) === 0;
  return t.weekdays.includes(weekday(day));
}

export function repeatLabel(t: Pick<Task, "repeat" | "every_n" | "weekdays">) {
  if (t.repeat === "daily") return "Every day";
  if (t.repeat === "every") return t.every_n === 1 ? "Every day" : `Every ${t.every_n} days`;
  if (t.repeat === "weekdays") return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, i) => t.weekdays.includes(i)).join(", ") || "No days";
  return "Once";
}

/** Done days per task: "taskId" → Set of days. */
export type Done = Map<string, Set<string>>;

/** Current streak (due days done in a row up to today; today not done yet doesn't break it) and best streak. */
export function taskStreak(t: Task, done: Done, today: string, lookback = 400) {
  const days = done.get(t.id) ?? new Set<string>();
  let current = 0;
  let best = 0;
  let run = 0;
  let counting = true;
  const first = t.starts_on > shift(today, -lookback) ? t.starts_on : shift(today, -lookback);
  for (let d = today; d >= first; d = shift(d, -1)) {
    if (!isDue(t, d)) continue;
    if (days.has(d)) {
      run++;
      if (counting) current++;
    } else {
      if (d !== today) counting = false;
      best = Math.max(best, run);
      run = 0;
    }
  }
  return { current, best: Math.max(best, run, current) };
}

/** Per day: how many tasks were due and done. */
export function dayStats(tasks: Task[], done: Done, from: string, to: string) {
  const out: { day: string; due: number; done: number }[] = [];
  for (let d = from; d <= to; d = shift(d, 1)) {
    let due = 0;
    let ok = 0;
    for (const t of tasks) {
      if (!isDue(t, d)) continue;
      due++;
      if (done.get(t.id)?.has(d)) ok++;
    }
    out.push({ day: d, due, done: ok });
  }
  return out;
}

/** Days in a row with every task done (today counts once it's complete) and the best run. */
export function overallStreak(tasks: Task[], done: Done, today: string, lookback = 400) {
  const stats = dayStats(tasks, done, shift(today, -lookback), today).reverse();
  let current = 0;
  let best = 0;
  let run = 0;
  let counting = true;
  for (const s of stats) {
    if (!s.due) continue; // a day with nothing planned doesn't break a streak
    const complete = s.done === s.due;
    if (complete) {
      run++;
      if (counting) current++;
    } else {
      if (s.day !== today) counting = false;
      best = Math.max(best, run);
      run = 0;
    }
  }
  return { current, best: Math.max(best, run, current) };
}

// ---------------------------------------------------------------- charts and progress

export const fmtNum = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 100) / 100));
export const fmtValue = (n: number, unit: string) => {
  const u = unit.trim();
  if (!u) return fmtNum(n);
  return /^(lkr|rs\.?|usd|\$)$/i.test(u) ? `${u.toUpperCase() === "$" ? "$" : u.toUpperCase()} ${fmtNum(n)}` : `${fmtNum(n)} ${u}`;
};

const bucketOf = (day: string, grain: Chart["grain"]) => (grain === "day" ? day : grain === "month" ? `${day.slice(0, 7)}-01` : periodRange("week", day).starts_on);
const bucketLabel = (b: string, grain: Chart["grain"]) => (grain === "month" ? MONTHS[Number(b.slice(5, 7)) - 1]! : shortDate(b));

/** Points of a chart → rows for the chart: running total (or level) per day / week / month, with the target pace. */
export function chartRows(c: Chart, points: Point[], g: Pick<Goal, "starts_on" | "ends_on">, tz: string) {
  const own = points.filter((p) => p.chart_id === c.id);
  if (c.x_mode === "labels") {
    const by = new Map<string, number>();
    for (const p of [...own].sort((a, b) => a.at.localeCompare(b.at))) {
      const k = p.label?.trim() || "—";
      by.set(k, c.mode === "total" ? (by.get(k) ?? 0) + p.value : p.value);
    }
    return [...by].map(([x, value]) => ({ x, value, pace: null as number | null }));
  }
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const sorted = [...own].map((p) => ({ ...p, day: day(p.at) })).sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at));
  const first = sorted[0]?.day && sorted[0].day < g.starts_on ? sorted[0].day : g.starts_on;
  const lastPoint = sorted[sorted.length - 1]?.day ?? g.starts_on;
  const end = lastPoint > g.ends_on ? lastPoint : g.ends_on;
  const buckets: string[] = [];
  for (let d = bucketOf(first, c.grain); d <= end; ) {
    buckets.push(d);
    if (c.grain === "day") d = shift(d, 1);
    else if (c.grain === "week") d = shift(d, 7);
    else {
      const n = new Date(`${d}T00:00:00Z`);
      n.setUTCMonth(n.getUTCMonth() + 1);
      d = n.toISOString().slice(0, 10);
    }
    if (buckets.length > 400) break;
  }
  const span = Math.max(1, daysBetween(g.starts_on, g.ends_on) + 1);
  let running = 0;
  let level: number | null = null;
  let i = 0;
  return buckets.map((b) => {
    const next = c.grain === "day" ? shift(b, 1) : c.grain === "week" ? shift(b, 7) : bucketOf(shift(`${b.slice(0, 7)}-28`, 7), "month");
    let inBucket = 0;
    let had = false;
    while (i < sorted.length && sorted[i]!.day < next) {
      inBucket += sorted[i]!.value;
      level = sorted[i]!.value;
      had = true;
      i++;
    }
    running += inBucket;
    const bucketEnd = shift(next, -1) > g.ends_on ? g.ends_on : shift(next, -1);
    const pace = c.target != null && c.mode === "total" ? Math.max(0, Math.min(1, (daysBetween(g.starts_on, bucketEnd) + 1) / span)) * c.target : null;
    const value = c.mode === "total" ? (c.kind === "bar" ? inBucket : running) : level;
    return { x: bucketLabel(b, c.grain), value: c.mode === "value" && !had && level === null ? null : value, pace: c.kind === "bar" ? null : pace };
  });
}

export type Progress = { current: number; target: number | null; pct: number | null; expected: number | null; status: "done" | "ahead" | "on_track" | "behind" | "no_target" };

/** Where a chart stands: now vs target, and vs where it should be by today (straight-line pace). */
export function chartProgress(c: Chart, points: Point[], g: Pick<Goal, "starts_on" | "ends_on">, today: string): Progress {
  const own = points.filter((p) => p.chart_id === c.id).sort((a, b) => a.at.localeCompare(b.at));
  const current = c.mode === "total" ? own.reduce((s, p) => s + p.value, 0) : (own[own.length - 1]?.value ?? 0);
  if (c.target == null) return { current, target: null, pct: null, expected: null, status: "no_target" };
  // Totals: sum / target. Levels (weight 80 → 70, balance 20k → 100k): from the first value towards the target, either way.
  const start = own[0]?.value ?? current;
  const pct = c.mode === "total" ? current / Math.max(1e-9, c.target) : start === c.target ? 1 : (current - start) / (c.target - start);
  const span = Math.max(1, daysBetween(g.starts_on, g.ends_on) + 1);
  const elapsed = Math.max(0, Math.min(1, (daysBetween(g.starts_on, today) + 1) / span));
  const expected = c.x_mode === "time" ? elapsed : null;
  const status = pct >= 1 ? "done" : expected == null ? "on_track" : pct >= expected * 1.1 ? "ahead" : pct >= expected * 0.9 ? "on_track" : "behind";
  return { current, target: c.target, pct: Math.max(0, pct), expected, status };
}

export const STATUS_TEXT: Record<Progress["status"], { label: string; tone: "success" | "brand" | "warning" | "neutral" }> = {
  done: { label: "Done", tone: "success" },
  ahead: { label: "Ahead", tone: "success" },
  on_track: { label: "On track", tone: "brand" },
  behind: { label: "Behind", tone: "warning" },
  no_target: { label: "No target", tone: "neutral" },
};

/** A goal's progress: its first chart with a target, else the share of its tasks done so far. */
export function goalProgress(g: Goal, charts: Chart[], points: Point[], today: string, taskRate: number | null): Progress | null {
  const main = charts.filter((c) => c.goal_id === g.id && c.target != null).sort((a, b) => a.sort - b.sort)[0];
  if (main) return chartProgress(main, points, g, today);
  if (taskRate == null) return null;
  return { current: taskRate, target: 1, pct: taskRate, expected: null, status: taskRate >= 0.999 ? "done" : taskRate >= 0.8 ? "on_track" : "behind" };
}
