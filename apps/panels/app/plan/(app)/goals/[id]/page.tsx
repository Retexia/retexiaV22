import { Badge, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddChartButton, ChartCard } from "@/components/plan/chart-card";
import { GoalActions } from "@/components/plan/goal-actions";
import { GoalChat } from "@/components/plan/goal-chat";
import { GoalPeople } from "@/components/plan/goal-people";
import { GoalTasks } from "@/components/plan/goal-tasks";
import { NewGoalButton } from "@/components/plan/new-goal-button";
import { goalTaskRate, loadCharts, loadGoal } from "@/lib/plan/data";
import { STATUS_TEXT, categoryOf, daysBetween, goalProgress, isDue, periodLabel, smallerOf, taskStreak, type Goal } from "@/lib/plan/logic";
import { requirePlanPage } from "@/lib/plan/session";

export const metadata = { title: "Goal" };

export default async function PlanGoal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db, today, settings } = await requirePlanPage(`/goals/${id}`);
  const data = await loadGoal(db, id, user.id, today);
  if (!data) notFound();
  const { goal, role, charts, points, owner, members, messages, children, parent, tasks, done, names } = data;
  const cat = categoryOf(goal.category);
  const progress = goalProgress(goal, charts, points, today, role === "owner" ? goalTaskRate(goal, tasks, done, today) : null, settings.timezone);
  const left = daysBetween(today, goal.ends_on);
  const isOwner = role === "owner";
  const smaller = smallerOf(goal);
  const { data: own } = isOwner ? await db.from("goals").select("id, title, period, starts_on, ends_on").eq("owner_id", user.id).eq("status", "active") : { data: [] };
  const parents = (own ?? []) as Pick<Goal, "id" | "title" | "period" | "starts_on" | "ends_on">[];
  const { charts: childCharts, points: childPoints } = await loadCharts(db, children.map((c) => c.id));
  const status = goal.status === "done" ? { label: "Done", tone: "success" as const } : goal.status === "dropped" ? { label: "Dropped", tone: "neutral" as const } : progress ? STATUS_TEXT[progress.status] : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/goals", label: "Goals" }}
        title={goal.title}
        description={
          <>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.label} · {periodLabel(goal)} · {goal.status !== "active" ? "" : left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : left === 0 ? "last day" : "ended"}
            </span>
            {parent ? (
              <span className="block">
                Part of{" "}
                <Link href={`/goals/${parent.id}`} className="text-link">
                  {parent.title}
                </Link>
              </span>
            ) : null}
            {goal.why ? <span className="mt-1 block italic">“{goal.why}”</span> : null}
          </>
        }
        chips={
          <>
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
            {progress?.pct != null ? <Badge tone="neutral">{Math.round(progress.pct * 100)}%</Badge> : null}
            {!isOwner ? <Badge tone="brand">{role === "editor" ? "Shared with you · can add values" : "Shared with you"}</Badge> : null}
          </>
        }
        actions={isOwner ? <GoalActions goal={goal} parents={parents} today={today} /> : null}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="type-h2 text-ink">Charts</h2>
              {isOwner ? <AddChartButton goalId={goal.id} /> : null}
            </div>
            {charts.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {charts.map((c) => (
                  <ChartCard key={c.id} chart={c} points={points} goal={goal} role={role} today={today} tz={settings.timezone} color={cat.color} names={names} />
                ))}
              </div>
            ) : (
              <Card className="type-body text-ink-muted">
                {isOwner ? "Add a chart for what you want to track: income, savings, weight, pages, clients… Add values any time and watch the line move." : "No charts yet."}
              </Card>
            )}
          </section>

          {isOwner ? (
            <GoalTasks
              goalId={goal.id}
              goals={parents.map((g) => ({ id: g.id, title: g.title }))}
              today={today}
              tasks={tasks.map((t) => {
                const s = taskStreak(t, done, today);
                return { ...t, streak: s.current, best: s.best, doneToday: Boolean(done.get(t.id)?.has(today)), dueToday: isDue(t, today) };
              })}
            />
          ) : null}

          {smaller && (isOwner || children.length) ? (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="type-h3 text-ink">{smaller === "month" ? "Monthly goals" : "Weekly goals"} inside this goal</h2>
                {isOwner && goal.status === "active" ? <NewGoalButton parents={parents} today={today} defaults={{ period: smaller, parent_id: goal.id }} label="Add" variant="secondary" /> : null}
              </div>
              {children.length ? (
                <ul className="flex flex-col divide-y divide-line">
                  {children.map((c: Goal) => {
                    const p = goalProgress(c, childCharts, childPoints, today, null, settings.timezone);
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-2">
                        <Link href={`/goals/${c.id}`} className="min-w-0 flex-1 truncate type-body text-ink hover:text-brand">
                          {c.title}
                        </Link>
                        <span className="type-small text-ink-muted">{periodLabel(c)}</span>
                        {p?.pct != null ? <Badge tone={STATUS_TEXT[p.status].tone}>{Math.round(p.pct * 100)}%</Badge> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="type-small text-ink-muted">Break it into smaller {smaller === "month" ? "monthly" : "weekly"} goals.</p>
              )}
            </Card>
          ) : null}

          <GoalPeople goalId={goal.id} owner={owner.name} members={members as never} isOwner={isOwner} me={user.id} />
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <GoalChat goalId={goal.id} me={user.id} initial={messages} names={names} coachFirst={members.length === 0} />
        </div>
      </div>
    </div>
  );
}
