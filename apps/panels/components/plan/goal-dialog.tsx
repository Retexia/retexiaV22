"use client";

import { Button, Dialog, Field, Input, RadioCards, Select, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveGoal } from "@/app/plan/actions";
import { CATEGORIES, periodLabel, periodRange, type Category, type Goal, type Period } from "@/lib/plan/logic";

type Template = "income" | "savings" | "habit" | "custom";
const TEMPLATES: { value: Template; label: string; description: string; category: Category }[] = [
  { value: "income", label: "Income", description: "A money target with a daily income chart.", category: "income" },
  { value: "savings", label: "Savings", description: "Put money aside and watch it grow.", category: "savings" },
  { value: "habit", label: "Habit", description: "Something you do again and again, with a streak.", category: "habit" },
  { value: "custom", label: "Other", description: "Anything: start blank, add charts later.", category: "custom" },
];
const BIGGER: Record<Period, Period[]> = { week: ["month", "year"], month: ["year"], year: [] };

/** New goal (from a template) or edit one. */
export function GoalDialog({
  open,
  onClose,
  goal,
  parents,
  today,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  goal?: Goal;
  parents: Pick<Goal, "id" | "title" | "period" | "starts_on" | "ends_on">[];
  today: string;
  defaults?: { period?: Period; parent_id?: string };
}) {
  const router = useRouter();
  const [v, setV] = useState(() => ({
    template: "custom" as Template,
    title: goal?.title ?? "",
    why: goal?.why ?? "",
    period: (goal?.period ?? defaults?.period ?? "month") as Period,
    on: goal?.starts_on ?? today,
    category: (goal?.category ?? "custom") as Category,
    parent_id: goal?.parent_id ?? defaults?.parent_id ?? "",
    target: "",
    unit: "",
    habit: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const range = periodRange(v.period, v.on || today);
  const money = v.template === "income" || v.template === "savings";
  const options = parents.filter((p) => p.id !== goal?.id && BIGGER[v.period].includes(p.period) && p.starts_on <= range.starts_on && p.ends_on >= range.ends_on);

  async function save() {
    setBusy(true);
    const target = v.target.trim() === "" ? null : Number(v.target.replace(/,/g, ""));
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      setBusy(false);
      return setErrors({ target: "Enter a number above 0, or leave it empty" });
    }
    const r = await saveGoal({ ...v, id: goal?.id, parent_id: v.parent_id || null, target, unit: money ? v.unit || "LKR" : v.unit });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    onClose();
    if (!goal && r.data?.id) router.push(`/goals/${String(r.data.id)}`);
    else router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      size="lg"
      title={goal ? "Edit goal" : "New goal"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save} disabled={!v.title.trim()}>
            {goal ? "Save" : "Create goal"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!goal ? (
          <Field label="Start from" labelAs="legend">
            <RadioCards
              name="template"
              columns={2}
              value={v.template}
              onChange={(t) => {
                const tpl = TEMPLATES.find((x) => x.value === t)!;
                setV({ ...v, template: tpl.value, category: tpl.category });
              }}
              options={TEMPLATES.map((t) => ({ value: t.value, label: t.label, description: t.description }))}
            />
          </Field>
        ) : null}
        <Field label="Goal" error={errors.title} required>
          <Input
            autoFocus
            value={v.title}
            maxLength={140}
            placeholder={v.template === "income" ? "e.g. Earn LKR 300,000 this month" : v.template === "savings" ? "e.g. Save LKR 100,000" : v.template === "habit" ? "e.g. Read every day" : "e.g. Launch my online shop"}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="For a" labelAs="legend">
            <RadioCards
              name="period"
              columns={3}
              compact
              value={v.period}
              onChange={(p) => setV({ ...v, period: p as Period, parent_id: "" })}
              options={[
                { value: "year", label: "Year" },
                { value: "month", label: "Month" },
                { value: "week", label: "Week" },
              ]}
            />
          </Field>
          <Field label="Which one" hint={periodLabel({ period: v.period, ...range })}>
            <Input type="date" value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} />
          </Field>
        </div>
        {!goal && v.template !== "habit" ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Target" hint={money ? "The amount you want to reach." : "A number to reach (leave empty if there isn't one)."} error={errors.target} optionalLabel="Optional">
              <Input inputMode="decimal" value={v.target} placeholder={money ? "300000" : "e.g. 20"} onChange={(e) => setV({ ...v, target: e.target.value })} />
            </Field>
            <Field label="Unit">
              <Input value={money ? v.unit || "LKR" : v.unit} maxLength={20} placeholder={money ? "LKR" : "e.g. books, kg, clients"} onChange={(e) => setV({ ...v, unit: e.target.value })} />
            </Field>
          </div>
        ) : null}
        {!goal && v.template === "habit" ? (
          <Field label="The habit (a daily task)" hint="It goes on your Today list every day of this goal." optionalLabel="Optional">
            <Input value={v.habit} maxLength={140} placeholder="e.g. Read 10 pages" onChange={(e) => setV({ ...v, habit: e.target.value })} />
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            <Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Category })} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
          </Field>
          {options.length ? (
            <Field label="Part of a bigger goal" optionalLabel="Optional">
              <Select value={v.parent_id} onChange={(e) => setV({ ...v, parent_id: e.target.value })} placeholder="None" options={options.map((p) => ({ value: p.id, label: `${p.title} (${periodLabel(p)})` }))} />
            </Field>
          ) : null}
        </div>
        <Field label="Why it matters to you" hint="The coach uses this to keep you going." optionalLabel="Optional">
          <Textarea rows={2} value={v.why} maxLength={1000} onChange={(e) => setV({ ...v, why: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}
