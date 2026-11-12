import "server-only";

import { loadCharts, loadTasks, people } from "./data";
import type { PlanDb } from "./db";
import { PER, chartProgress, daysBetween, goalProgress, overallStreak, periodLabel, repeatLabel, shift, taskStreak, type Goal } from "./logic";
import { planWorker } from "./n8n";

const LANG = { en: "English", si: "Sinhala (Sinhala script)", singlish: "Singlish (Sinhala in English letters)", ta: "Tamil (Tamil script)" } as const;

/** Everything the coach needs about one goal, as plain facts (no ids, no emails). */
export async function coachContext(db: PlanDb, goal: Goal, askerId: string, today: string, language: keyof typeof LANG) {
  const [{ charts, points }, { tasks, done }, { data: messages }, { data: children }, { data: parent }] = await Promise.all([
    loadCharts(db, [goal.id]),
    loadTasks(db, goal.owner_id, today),
    db.from("messages").select("kind, body, author_id, created_at").eq("goal_id", goal.id).order("created_at", { ascending: false }).limit(16),
    db.from("goals").select("*").eq("parent_id", goal.id),
    goal.parent_id ? db.from("goals").select("title, period, starts_on, ends_on").eq("id", goal.parent_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const names = await people([askerId, goal.owner_id, ...(messages ?? []).map((m) => m.author_id)]);
  const { charts: childCharts, points: childPoints } = await loadCharts(db, (children ?? []).map((c) => c.id));
  const linked = tasks.filter((t) => t.goal_id === goal.id);
  return {
    today,
    language: LANG[language],
    asker: names.get(askerId)?.name ?? "the user",
    owner: names.get(goal.owner_id)?.name ?? "the owner",
    goal: {
      title: goal.title,
      why: goal.why,
      category: goal.category,
      period: periodLabel(goal),
      from: goal.starts_on,
      to: goal.ends_on,
      days_left: Math.max(0, daysBetween(today, goal.ends_on)),
      status: goal.status,
      part_of: parent ? `${parent.title} (${periodLabel(parent as Goal)})` : null,
    },
    charts: charts.map((c) => {
      const p = chartProgress(c, points, goal, today);
      return {
        title: c.title,
        unit: c.unit,
        how:
          c.mode === "rate"
            ? `target is a rate: reach ${c.target ?? "?"} ${PER[c.grain]} by the end and keep it; values on the same ${c.grain} add up; "now" is the ${p.rate?.window}`
            : c.mode === "total"
              ? "target is a total by the end; values add up"
              : "each value is the new level",
        target: c.target,
        now: p.current,
        ...(p.rate
          ? {
              started_at: p.rate.start,
              should_be_by_today: p.rate.should_be == null ? null : Math.round(p.rate.should_be * 100) / 100,
              latest: p.rate.latest,
              best: p.rate.best,
              [`${c.grain}s_logged`]: p.rate.logged,
              [`${c.grain}s_at_target`]: p.rate.hits,
              [`${c.grain}s_in_a_row_at_target`]: p.rate.streak,
            }
          : {}),
        progress_pct: p.pct == null ? null : Math.round(p.pct * 100),
        should_be_pct_by_today: p.expected == null ? null : Math.round(p.expected * 100),
        status: p.status,
        recent: points.filter((x) => x.chart_id === c.id).slice(-12).map((x) => ({ on: x.at.slice(0, 10), value: x.value, ...(x.label ? { label: x.label } : {}), ...(x.note ? { note: x.note } : {}) })),
      };
    }),
    tasks: linked.map((t) => {
      const s = taskStreak(t, done, today);
      const last14 = Array.from({ length: 14 }, (_, i) => shift(today, -i)).filter((d) => d >= t.starts_on);
      return { title: t.title, repeat: repeatLabel(t), streak: s.current, best_streak: s.best, done_today: Boolean(done.get(t.id)?.has(today)), done_last_14_days: last14.filter((d) => done.get(t.id)?.has(d)).length };
    }),
    smaller_goals: (children ?? []).map((c) => {
      const p = goalProgress(c as Goal, childCharts, childPoints, today, null);
      return { title: c.title, period: periodLabel(c as Goal), progress_pct: p?.pct == null ? null : Math.round(p.pct * 100), status: p?.status ?? "no_target" };
    }),
    daily_streak: overallStreak(tasks, done, today).current,
    chat: ((messages ?? []) as { kind: string; body: string; author_id: string | null }[])
      .reverse()
      .map((m) => ({ from: m.kind === "coach" ? "coach" : (names.get(m.author_id ?? "")?.name ?? "someone"), text: m.body.slice(0, 800) })),
  };
}

/** Asks the coach (n8n → OpenRouter) and posts the answer in the goal's chat. */
export async function coachReply(db: PlanDb, goal: Goal, askerId: string, today: string, language: keyof typeof LANG) {
  const context = await coachContext(db, goal, askerId, today, language);
  const r = await planWorker<{ reply?: string }>("coach", { context }, 90_000);
  const body =
    r.ok && r.reply?.trim()
      ? r.reply.trim().slice(0, 4000)
      : `I couldn't answer just now (${r.ok ? "empty answer" : r.error}). Please ask me again in a minute.`;
  await db.from("messages").insert({ goal_id: goal.id, author_id: null, kind: "coach", body });
}
