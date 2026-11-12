import "server-only";

import { localDate, timeIn } from "../time";
import { goalTaskRate, loadGoals, loadTasks, people } from "./data";
import { planDb } from "./db";
import { STATUS_TEXT, dayStats, goalProgress, isDue, overallStreak, periodLabel, progressText, shift } from "./logic";
import { planWorker } from "./n8n";

const LANG = { en: "English", si: "Sinhala (Sinhala script)", singlish: "Singlish (Sinhala in English letters)", ta: "Tamil (Tamil script)" } as const;
const planUrl = () => (process.env.PLAN_PANEL_URL || "https://plan.retexia.com").replace(/\/+$/, "");
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

type Row = { user_id: string; timezone: string; whatsapp: string | null; morning_time: string; coach_language: keyof typeof LANG; last_morning_on: string | null; last_weekly_on: string | null };

/** Today's tasks, streak and goals for one person (what the morning message and the weekly email are built from). */
async function snapshot(userId: string, today: string, tz: string) {
  const db = planDb();
  const [{ tasks, done }, { goals, charts, points }] = await Promise.all([loadTasks(db, userId, today), loadGoals(db, userId)]);
  const active = goals.filter((g) => g.role === "owner" && g.status === "active" && g.starts_on <= today && g.ends_on >= today);
  const goalLines = active.map((g) => {
    const p = goalProgress(g, charts, points, today, goalTaskRate(g, tasks, done, today), tz);
    const unit = charts.find((c) => c.goal_id === g.id && c.target != null)?.unit ?? "";
    const now = p && (p.rate || (p.target != null && p.target !== 1)) ? progressText(p, unit) : null;
    return { title: g.title, period: periodLabel(g), progress_pct: p?.pct == null ? null : Math.round(p.pct * 100), status: p ? STATUS_TEXT[p.status].label : "No target", ...(now ? { now } : {}) };
  });
  return { tasks, done, goalLines, streak: overallStreak(tasks, done, today) };
}

/** Morning WhatsApp: at each person's chosen time (within 3 hours of it), once a day. */
export async function runMorning(limit = 40) {
  const db = planDb();
  const { data } = await db.from("settings").select("user_id, timezone, whatsapp, morning_time, coach_language, last_morning_on, last_weekly_on").eq("morning_on", true).not("whatsapp", "is", null).limit(1000);
  let sent = 0;
  for (const s of (data ?? []) as Row[]) {
    if (sent >= limit) break;
    const today = localDate(s.timezone);
    const now = minutes(timeIn(s.timezone, new Date().toISOString()));
    const at = minutes(String(s.morning_time).slice(0, 5));
    if (s.last_morning_on === today || now < at || now > at + 180) continue;
    const name = (await people([s.user_id])).get(s.user_id)?.name ?? "";
    const snap = await snapshot(s.user_id, today, s.timezone);
    const todays = snap.tasks.filter((t) => isDue(t, today)).map((t) => t.title);
    const r = await planWorker("morning", {
      number: s.whatsapp,
      context: { name: name.split(" ")[0] ?? "", language: LANG[s.coach_language] ?? "English", today, tasks_today: todays, streak_days: snap.streak.current, best_streak: snap.streak.best, goals: snap.goalLines.slice(0, 5), link: planUrl() },
    }, 90_000);
    if (r.ok) {
      await db.from("settings").update({ last_morning_on: today }).eq("user_id", s.user_id);
      sent++;
    } else console.error("[plan morning]", s.user_id, r.error);
  }
  return { sent };
}

/** Weekly email: Sunday from 18:00 (their time), once a week, through the Retexia email outbox. */
export async function runWeekly(limit = 40) {
  const db = planDb();
  const { data } = await db.from("settings").select("user_id, timezone, whatsapp, morning_time, coach_language, last_morning_on, last_weekly_on").eq("weekly_on", true).limit(2000);
  let sent = 0;
  for (const s of (data ?? []) as Row[]) {
    if (sent >= limit) break;
    const today = localDate(s.timezone);
    const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
    if (!isSunday || s.last_weekly_on === today || minutes(timeIn(s.timezone, new Date().toISOString())) < 18 * 60) continue;
    const person = (await people([s.user_id])).get(s.user_id);
    if (!person?.email) continue;
    const snap = await snapshot(s.user_id, today, s.timezone);
    const week = dayStats(snap.tasks, snap.done, shift(today, -6), today);
    const prev = dayStats(snap.tasks, snap.done, shift(today, -13), shift(today, -7));
    const sum = (x: typeof week) => ({ due: x.reduce((a, d) => a + d.due, 0), done: x.reduce((a, d) => a + d.done, 0) });
    const w = sum(week);
    const p = sum(prev);
    // Nothing planned and no goals: no email.
    if (!w.due && !snap.goalLines.length) {
      await db.from("settings").update({ last_weekly_on: today }).eq("user_id", s.user_id);
      continue;
    }
    const facts = {
      name: person.name.split(" ")[0] ?? "",
      language: LANG[s.coach_language] ?? "English",
      tasks_done: w.done,
      tasks_planned: w.due,
      last_week_done: p.done,
      last_week_planned: p.due,
      streak_days: snap.streak.current,
      best_streak: snap.streak.best,
      goals: snap.goalLines,
    };
    const ai = await planWorker<{ text?: string }>("weekly", { context: facts }, 90_000);
    const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
    const body = [
      ai.ok && ai.text?.trim() ? ai.text.trim() : `Here is your week, ${facts.name || "friend"}.`,
      "",
      `Tasks: ${w.done} of ${w.due} done (${pct(w.done, w.due)}), last week ${p.done} of ${p.due} (${pct(p.done, p.due)}).`,
      `Streak: ${snap.streak.current} day${snap.streak.current === 1 ? "" : "s"} (best ${snap.streak.best}).`,
      ...(snap.goalLines.length ? ["", "Your goals:", ...snap.goalLines.map((g) => `• ${g.title} (${g.period}): ${g.progress_pct == null ? g.status : `${g.progress_pct}%, ${g.status}`}`)] : []),
    ].join("\n");
    const { error } = await db.rpc("queue_email", {
      p_event: "plan.weekly",
      p_recipient: person.email,
      p_user: s.user_id,
      p_subject: `Your week on Retexia Plan: ${w.done}/${w.due} tasks, ${snap.streak.current}-day streak`,
      p_body: body,
      p_payload: { url: planUrl(), button: "Open Retexia Plan" },
    });
    if (error) {
      console.error("[plan weekly]", s.user_id, error.message);
      continue;
    }
    await db.from("settings").update({ last_weekly_on: today }).eq("user_id", s.user_id);
    sent++;
  }
  return { sent };
}
