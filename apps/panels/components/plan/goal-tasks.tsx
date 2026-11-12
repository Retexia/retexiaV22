"use client";

import { Badge, Button, Card } from "@retexia/ui";
import { Flame, Plus } from "lucide-react";
import { useState } from "react";
import { repeatLabel, type Task } from "@/lib/plan/logic";
import { TaskDialog } from "./task-dialog";

/** The daily tasks that move this goal, with their streaks. */
export function GoalTasks({ goalId, goals, tasks, today }: { goalId: string; goals: { id: string; title: string }[]; tasks: (Task & { streak: number; best: number; doneToday: boolean; dueToday: boolean })[]; today: string }) {
  const [dialog, setDialog] = useState<{ task?: Task } | null>(null);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-h3 text-ink">Daily tasks for this goal</h2>
        <Button size="sm" variant="secondary" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDialog({})}>
          Add task
        </Button>
      </div>
      {tasks.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <button type="button" onClick={() => setDialog({ task: t })} className="min-w-0 flex-1 truncate text-left type-body text-ink hover:text-brand focus-visible:focus-ring">
                {t.title}
              </button>
              <span className="type-small text-ink-muted">{repeatLabel(t)}</span>
              {t.dueToday ? <Badge tone={t.doneToday ? "success" : "neutral"}>{t.doneToday ? "Done today" : "Today"}</Badge> : null}
              <span className="flex items-center gap-1 type-small text-ink-muted" title={`Best: ${t.best}`}>
                <Flame aria-hidden size={14} strokeWidth={1.5} className={t.streak ? "text-warning" : ""} />
                {t.streak}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-small text-ink-muted">Break the goal into small things you do every day or every few days. They show up on Today and build your streak.</p>
      )}
      {dialog ? <TaskDialog open onClose={() => setDialog(null)} goals={goals} goalId={goalId} task={dialog.task} today={today} /> : null}
    </Card>
  );
}
