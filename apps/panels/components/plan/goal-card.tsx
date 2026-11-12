import { Badge, Card } from "@retexia/ui";
import { Users } from "lucide-react";
import Link from "next/link";
import { STATUS_TEXT, categoryOf, periodLabel, progressText, type Goal, type Progress, type Role } from "@/lib/plan/logic";

/** A goal at a glance: kind, period, progress against target and pace. */
export function GoalCard({ goal, role, progress, unit, owner }: { goal: Goal; role: Role; progress: Progress | null; unit: string; owner?: string }) {
  const cat = categoryOf(goal.category);
  const pct = progress?.pct == null ? null : Math.min(100, Math.round(progress.pct * 100));
  const expected = progress?.expected == null ? null : Math.min(100, Math.round(progress.expected * 100));
  const status = goal.status === "done" ? { label: "Done", tone: "success" as const } : goal.status === "dropped" ? { label: "Dropped", tone: "neutral" as const } : progress ? STATUS_TEXT[progress.status] : null;
  return (
    <Card className={`flex flex-col gap-3 ${goal.status === "dropped" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 type-small text-ink-muted">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
            {cat.label} · {periodLabel(goal)}
          </span>
          <Link href={`/goals/${goal.id}`} className="type-h3 text-ink hover:text-brand focus-visible:focus-ring">
            {goal.title}
          </Link>
        </div>
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
      </div>
      {pct != null ? (
        <div className="flex flex-col gap-1.5">
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-sunk" role="meter" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
            {expected != null && goal.status === "active" ? <span aria-hidden className="absolute inset-y-0 w-0.5 bg-ink/40" style={{ left: `${expected}%` }} title="Where you should be today" /> : null}
          </div>
          <span className="type-small text-ink-muted">
            {progress?.rate || (progress?.target != null && progress.target !== 1) ? progressText(progress!, unit) : `${pct}% of tasks done`}
            {pct != null ? ` · ${pct}%` : ""}
          </span>
        </div>
      ) : (
        <span className="type-small text-ink-muted">Add a chart with a target, or tasks, to see progress.</span>
      )}
      {role !== "owner" ? (
        <span className="flex items-center gap-1.5 type-small text-ink-muted">
          <Users aria-hidden size={14} strokeWidth={1.5} />
          Shared by {owner ?? "someone"} · {role === "editor" ? "you can add values" : "view only"}
        </span>
      ) : null}
    </Card>
  );
}
