import type { ReactNode } from "react";
import { PlanShell } from "@/components/plan/plan-shell";
import { webUrl } from "@/lib/env";
import { loadTasks } from "@/lib/plan/data";
import { isDue, overallStreak } from "@/lib/plan/logic";
import { requirePlanPage } from "@/lib/plan/session";

export const metadata = { title: { default: "Retexia Plan", template: "%s · Retexia Plan" } };

export default async function PlanLayout({ children }: { children: ReactNode }) {
  const { user, db, today } = await requirePlanPage();
  const { tasks, done } = await loadTasks(db, user.id, today);
  const left = tasks.filter((t) => isDue(t, today) && !done.get(t.id)?.has(today)).length;
  return (
    <PlanShell webUrl={webUrl()} email={user.email} streak={overallStreak(tasks, done, today).current} todayLeft={left}>
      {children}
    </PlanShell>
  );
}
