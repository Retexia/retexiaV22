"use client";

import { Button, Dialog, Field, Input, RadioCards, Select } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveTask } from "@/app/plan/actions";
import type { Task } from "@/lib/plan/logic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Add or change a daily goal: once, every day, every few days, or on some weekdays; optionally for a goal. */
export function TaskDialog({
  open,
  onClose,
  goals,
  task,
  goalId,
  today,
}: {
  open: boolean;
  onClose: () => void;
  goals: { id: string; title: string }[];
  task?: Task;
  goalId?: string;
  today: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(() => ({
    title: task?.title ?? "",
    repeat: (task?.repeat ?? "daily") as Task["repeat"],
    every_n: task?.every_n && task.every_n > 1 ? task.every_n : 2,
    weekdays: task?.weekdays ?? [1, 2, 3, 4, 5],
    starts_on: task?.starts_on ?? today,
    goal_id: task?.goal_id ?? goalId ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await saveTask({ id: task?.id, ...v, goal_id: v.goal_id || null });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      title={task ? "Edit task" : "New task"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save} disabled={!v.title.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Task" error={errors.title} required>
          <Input autoFocus value={v.title} maxLength={140} placeholder="e.g. Call 5 customers" onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label="How often" labelAs="legend">
          <RadioCards
            name="repeat"
            columns={2}
            compact
            value={v.repeat}
            onChange={(repeat) => setV({ ...v, repeat: repeat as Task["repeat"] })}
            options={[
              { value: "none", label: "Once" },
              { value: "daily", label: "Every day" },
              { value: "every", label: "Every few days" },
              { value: "weekdays", label: "On some weekdays" },
            ]}
          />
        </Field>
        {v.repeat === "every" ? (
          <Field label="Every" className="max-w-[200px]">
            <Select value={String(v.every_n)} onChange={(e) => setV({ ...v, every_n: Number(e.target.value) })} options={[2, 3, 4, 5, 6, 7, 10, 14].map((n) => ({ value: String(n), label: `${n} days` }))} />
          </Field>
        ) : null}
        {v.repeat === "weekdays" ? (
          <Field label="On" labelAs="legend" error={errors.weekdays}>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = v.weekdays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setV({ ...v, weekdays: on ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i] })}
                    className={`h-9 min-w-12 rounded-full border px-3 type-label focus-visible:focus-ring ${on ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-muted hover:text-ink"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}
        <Field label={v.repeat === "none" ? "On" : "Starting"} className="max-w-[220px]">
          <Input type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value })} />
        </Field>
        {goals.length ? (
          <Field label="For a goal" optionalLabel="Optional">
            <Select value={v.goal_id} onChange={(e) => setV({ ...v, goal_id: e.target.value })} placeholder="No goal" options={goals.map((g) => ({ value: g.id, label: g.title }))} />
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}
