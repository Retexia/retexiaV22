import { Card, EmptyState } from "@retexia/ui";
import { PageHeader, StatCard } from "@retexia/ui/admin";
import { Flame, Target, Trophy, TrendingUp } from "lucide-react";
import { GoalCard } from "@/components/plan/goal-card";
import { Heatmap } from "@/components/plan/heatmap";
import { NewGoalButton } from "@/components/plan/new-goal-button";
import { WeekChart } from "@/components/plan/week-chart";
import { goalTaskRate, loadGoals, loadTasks, people } from "@/lib/plan/data";
import { dayStats, goalProgress, overallStreak, shift } from "@/lib/plan/logic";
import { requirePlanPage } from "@/lib/plan/session";

export const metadata = { title: "Overview" };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function PlanOverview() {
  const { user, db, today, settings } = await requirePlanPage("/overview");
  const [{ tasks, done }, { goals, charts, points }] = await Promise.all([loadTasks(db, user.id, today), loadGoals(db, user.id)]);
  const owners = await people(goals.map((g) => g.owner_id));
  const streak = overallStreak(tasks, done, today);
  const heat = dayStats(tasks, done, shift(today, -111), today);
  const monday = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const thisWeek = dayStats(tasks, done, monday, shift(monday, 6));
  const lastWeek = dayStats(tasks, done, shift(monday, -7), shift(monday, -1));
  const sum = (x: typeof thisWeek, upTo?: string) => x.filter((d) => !upTo || d.day <= upTo).reduce((a, d) => ({ due: a.due + d.due, done: a.done + d.done }), { due: 0, done: 0 });
  const tw = sum(thisWeek, today);
  const lw = sum(lastWeek);
  const running = goals.filter((g) => g.status === "active" && g.starts_on <= today && g.ends_on >= today);
  const rows = running.map((g) => ({ g, p: goalProgress(g, charts, points, today, g.role === "owner" ? goalTaskRate(g, tasks, done, today) : null, settings.timezone) }));
  const behind = rows.filter((r) => r.p?.status === "behind").length;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="How every goal is going, your streaks, and this week against last week." actions={<NewGoalButton parents={goals.filter((g) => g.role === "owner" && g.status === "active" && g.period !== "week")} today={today} />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Streak" value={`${streak.current} day${streak.current === 1 ? "" : "s"}`} hint="Days in a row with every task done" icon={<Flame aria-hidden size={18} strokeWidth={1.5} />} tone={streak.current ? "success" : "neutral"} />
        <StatCard label="Best streak" value={`${streak.best} day${streak.best === 1 ? "" : "s"}`} icon={<Trophy aria-hidden size={18} strokeWidth={1.5} />} />
        <StatCard label="This week" value={pct(tw.done, tw.due)} hint={`${tw.done} of ${tw.due} tasks · last week ${pct(lw.done, lw.due)}`} icon={<TrendingUp aria-hidden size={18} strokeWidth={1.5} />} tone={tw.due && lw.due && tw.done / tw.due < lw.done / lw.due ? "warning" : "neutral"} />
        <StatCard label="Goals running" value={running.length} hint={behind ? `${behind} behind` : "None behind"} icon={<Target aria-hidden size={18} strokeWidth={1.5} />} tone={behind ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Your last 16 weeks</h2>
          <Heatmap days={heat} />
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">This week vs last week</h2>
          <WeekChart rows={DOW.map((d, i) => ({ day: d, this_week: thisWeek[i]!.day <= today ? thisWeek[i]!.done : 0, last_week: lastWeek[i]!.done }))} />
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">Goals now</h2>
        {rows.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows
              .sort((a, b) => ["behind", "on_track", "no_target", "ahead", "done"].indexOf(a.p?.status ?? "no_target") - ["behind", "on_track", "no_target", "ahead", "done"].indexOf(b.p?.status ?? "no_target"))
              .map(({ g, p }) => (
                <GoalCard key={g.id} goal={g} role={g.role} owner={owners.get(g.owner_id)?.name} progress={p} unit={charts.find((c) => c.goal_id === g.id && c.target != null)?.unit ?? ""} />
              ))}
          </div>
        ) : (
          <EmptyState title="No goals running" icon={<Target aria-hidden size={24} strokeWidth={1.5} />}>
            Set a goal for this month: an income target, savings or a habit. Every big result starts with one small step.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
