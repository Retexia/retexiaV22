"use client";

import { Badge, Button, Card, Checkbox, DropdownMenu, EmptyState } from "@retexia/ui";
import { ChevronLeft, ChevronRight, Flame, ListTodo, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveTask, toggleTask } from "@/app/plan/actions";
import { repeatLabel, shift, shortDate, type Task } from "@/lib/plan/logic";
import { TaskDialog } from "./task-dialog";

export type TodayTask = Task & { done: boolean; streak: number; goal: string | null };

/** The day's to-do list: tick, streaks, add / edit / remove. */
export function TodayView({
  day,
  today,
  tasks,
  allTasks,
  goals,
}: {
  day: string;
  today: string;
  tasks: TodayTask[];
  allTasks: (Task & { goal: string | null })[];
  goals: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [items, setDone] = useOptimistic(tasks, (cur, change: { id: string; done: boolean }) => cur.map((t) => (t.id === change.id ? { ...t, done: change.done } : t)));
  const [dialog, setDialog] = useState<{ task?: Task } | null>(null);
  const doneCount = items.filter((t) => t.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const label = day === today ? "Today" : day === shift(today, -1) ? "Yesterday" : day === shift(today, 1) ? "Tomorrow" : shortDate(day);
  const future = day > today;

  const tick = (t: TodayTask, done: boolean) =>
    start(async () => {
      setDone({ id: t.id, done });
      const r = await toggleTask({ id: t.id, day, done });
      if (!r.ok) toast.error(r.message);
      else if (done && items.every((x) => x.id === t.id || x.done)) toast.success("All done for the day! 🔥");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button href={`/?day=${shift(day, -1)}`} variant="ghost" size="sm" icon={<ChevronLeft aria-hidden size={16} strokeWidth={1.5} />}>
            <span className="sr-only">Previous day</span>
          </Button>
          <div className="flex flex-col">
            <h1 className="type-h1 text-ink">{label}</h1>
            <span className="type-small text-ink-muted">{shortDate(day)}</span>
          </div>
          <Button href={`/?day=${shift(day, 1)}`} variant="ghost" size="sm" icon={<ChevronRight aria-hidden size={16} strokeWidth={1.5} />}>
            <span className="sr-only">Next day</span>
          </Button>
          {day !== today ? (
            <Button href="/" variant="secondary" size="sm">
              Today
            </Button>
          ) : null}
        </div>
        <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setDialog({})}>
          Add task
        </Button>
      </div>

      {items.length ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunk" role="meter" aria-label="Done today" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="type-label text-ink">
              {doneCount} of {items.length}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <Checkbox aria-label={`Done: ${t.title}`} checked={t.done} disabled={future} onChange={(e) => tick(t, e.target.checked)} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`type-body ${t.done ? "text-ink-muted line-through" : "text-ink"}`}>{t.title}</span>
                  <span className="flex flex-wrap items-center gap-2 type-small text-ink-muted">
                    {repeatLabel(t)}
                    {t.goal ? (
                      <Link href={`/goals/${t.goal_id}`} className="text-link">
                        {t.goal}
                      </Link>
                    ) : null}
                  </span>
                </div>
                {t.repeat !== "none" && t.streak > 0 ? (
                  <Badge tone="warning">
                    <Flame aria-hidden size={12} strokeWidth={1.5} className="mr-1 inline" />
                    {t.streak}
                  </Badge>
                ) : null}
                <TaskMenu onEdit={() => setDialog({ task: t })} task={t} />
              </li>
            ))}
          </ul>
          {future ? <p className="type-small text-ink-muted">You can tick these on the day.</p> : null}
        </Card>
      ) : (
        <EmptyState title={day === today ? "Nothing planned for today" : "Nothing planned for this day"} icon={<ListTodo aria-hidden size={24} strokeWidth={1.5} />}>
          Add the small things that move your goals: daily, every few days or on chosen weekdays. Do them every time and your streak grows.
        </EmptyState>
      )}

      {allTasks.length ? (
        <details className="rounded-lg border border-line px-4 py-3">
          <summary className="cursor-pointer type-label text-ink">All my tasks ({allTasks.length})</summary>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {allTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate type-body text-ink">{t.title}</span>
                <span className="type-small text-ink-muted">{repeatLabel(t)}</span>
                <TaskMenu onEdit={() => setDialog({ task: t })} task={t} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {dialog ? <TaskDialog open onClose={() => setDialog(null)} goals={goals} task={dialog.task} today={day < today ? today : day} /> : null}
    </div>
  );
}

function TaskMenu({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const router = useRouter();
  return (
    <DropdownMenu
      align="end"
      triggerLabel={`Options for ${task.title}`}
      triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring"
      trigger={<MoreHorizontal aria-hidden size={16} strokeWidth={1.5} />}
      items={[
        { type: "button", label: "Edit", icon: <Pencil aria-hidden size={14} strokeWidth={1.5} />, onSelect: onEdit },
        {
          type: "button",
          label: "Remove",
          danger: true,
          icon: <Trash2 aria-hidden size={14} strokeWidth={1.5} />,
          onSelect: async () => {
            if (!window.confirm(`Remove "${task.title}"? Past days stay in your streak history.`)) return;
            const r = await archiveTask({ id: task.id });
            toast[r.ok ? "success" : "error"](r.message ?? "");
            router.refresh();
          },
        },
      ]}
    />
  );
}
