import { TodayView } from "@/components/plan/today";
import { loadTasks } from "@/lib/plan/data";
import { isDue, shift, taskStreak } from "@/lib/plan/logic";
import { requirePlanPage } from "@/lib/plan/session";

export const metadata = { title: "Today" };

export default async function PlanToday({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day: asked } = await searchParams;
  const { user, db, today } = await requirePlanPage("/");
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= shift(today, -366) && asked <= shift(today, 60) ? asked : today;
  const [{ tasks, done }, { data: goals }] = await Promise.all([
    loadTasks(db, user.id, today),
    db.from("goals").select("id, title").eq("owner_id", user.id).eq("status", "active").gte("ends_on", today).order("starts_on"),
  ]);
  const title = new Map((goals ?? []).map((g) => [g.id, g.title]));
  return (
    <TodayView
      day={day}
      today={today}
      goals={goals ?? []}
      tasks={tasks
        .filter((t) => isDue(t, day))
        .map((t) => ({ ...t, done: Boolean(done.get(t.id)?.has(day)), streak: taskStreak(t, done, today).current, goal: t.goal_id ? (title.get(t.goal_id) ?? null) : null }))}
      allTasks={tasks.filter((t) => t.repeat !== "none" || t.starts_on >= today).map((t) => ({ ...t, goal: t.goal_id ? (title.get(t.goal_id) ?? null) : null }))}
    />
  );
}
