import { EmptyState } from "@retexia/ui";
import { LinkTabs, PageHeader } from "@retexia/ui/admin";
import { Target } from "lucide-react";
import { GoalCard } from "@/components/plan/goal-card";
import { NewGoalButton } from "@/components/plan/new-goal-button";
import { goalTaskRate, loadGoals, loadTasks, people } from "@/lib/plan/data";
import { goalProgress, type Period } from "@/lib/plan/logic";
import { requirePlanPage } from "@/lib/plan/session";

export const metadata = { title: "Goals" };

const GROUPS: { period: Period; title: string }[] = [
  { period: "year", title: "This year's goals" },
  { period: "custom", title: "Goals with their own length" },
  { period: "month", title: "Monthly goals" },
  { period: "week", title: "Weekly goals" },
];

export default async function PlanGoals({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "now" } = await searchParams;
  const { user, db, today, settings } = await requirePlanPage("/goals");
  const [{ goals, charts, points }, { tasks, done }] = await Promise.all([loadGoals(db, user.id), loadTasks(db, user.id, today)]);
  const owners = await people(goals.map((g) => g.owner_id));
  const visible = goals.filter((g) =>
    show === "done" ? g.status !== "active" || g.ends_on < today : show === "all" ? true : g.status === "active" && g.ends_on >= today,
  );
  const mine = visible.filter((g) => g.role === "owner");
  const shared = visible.filter((g) => g.role !== "owner");
  const card = (g: (typeof goals)[number]) => (
    <GoalCard
      key={g.id}
      goal={g}
      role={g.role}
      owner={owners.get(g.owner_id)?.name}
      progress={goalProgress(g, charts, points, today, g.role === "owner" ? goalTaskRate(g, tasks, done, today) : null, settings.timezone)}
      unit={charts.find((c) => c.goal_id === g.id && c.target != null)?.unit ?? ""}
    />
  );
  const parents = goals.filter((g) => g.role === "owner" && g.status === "active" && g.period !== "week");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Goals" description="Year, month and week goals, or any length you set (90 days, 6 months…). Each can have its own charts, tasks, people and coach." actions={<NewGoalButton parents={parents} today={today} />} />
      <LinkTabs
        label="Which goals"
        items={[
          { href: "/goals", label: "Now", active: show === "now" },
          { href: "/goals?show=done", label: "Finished and past", active: show === "done" },
          { href: "/goals?show=all", label: "All", active: show === "all" },
        ]}
      />
      {!mine.length && !shared.length ? (
        <EmptyState title={show === "now" ? "No goals yet" : "Nothing here yet"} icon={<Target aria-hidden size={24} strokeWidth={1.5} />}>
          Start with one goal for this month: an income target, savings, or a habit. Then break it into weekly goals and daily tasks.
        </EmptyState>
      ) : null}
      {GROUPS.map(({ period, title }) => {
        const list = mine.filter((g) => g.period === period);
        return list.length ? (
          <section key={period} className="flex flex-col gap-3">
            <h2 className="type-h2 text-ink">{title}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map(card)}</div>
          </section>
        ) : null;
      })}
      {shared.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="type-h2 text-ink">Shared with me</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shared.map(card)}</div>
        </section>
      ) : null}
    </div>
  );
}
