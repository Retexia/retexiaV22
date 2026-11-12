"use client";

import { Button, Dialog, Field, Input, RadioCards, Select, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveGoal } from "@/app/plan/actions";
import { CATEGORIES, LENGTH_UNITS, canContain, daysBetween, goalStart, lengthRange, lengthText, periodLabel, periodRange, shortDate, type Category, type Goal, type LengthUnit, type Period } from "@/lib/plan/logic";

type Template = "income" | "savings" | "habit" | "custom";
const TEMPLATES: { value: Template; label: string; description: string; category: Category }[] = [
  { value: "income", label: "Income", description: "A money target with a daily income chart.", category: "income" },
  { value: "savings", label: "Savings", description: "Put money aside and watch it grow.", category: "savings" },
  { value: "habit", label: "Habit", description: "Something you do again and again, with a streak.", category: "habit" },
  { value: "custom", label: "Other", description: "Anything: start blank, add charts later.", category: "custom" },
];

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
    // Start counting from: kept for an existing goal, else today (running period) or the first day (future one).
    from: goal?.starts_on ?? (defaults?.period === "custom" ? today : goalStart(periodRange(defaults?.period ?? "month", today), today)),
    // Custom length: n days/weeks/months/years from `from`.
    len_n: String(goal?.length_n ?? 30),
    len_unit: (goal?.length_unit ?? "day") as LengthUnit,
    category: (goal?.category ?? "custom") as Category,
    parent_id: goal?.parent_id ?? defaults?.parent_id ?? "",
    target: "",
    unit: "",
    habit: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const custom = v.period === "custom";
  const n = Number(v.len_n);
  const lengthOk = Number.isInteger(n) && n >= 1 && n <= 999;
  // Calendar goals: the year/month/week, counted from `from`. Custom goals: from `from` for n units.
  const calendar = v.period === "custom" ? null : periodRange(v.period, v.on || today);
  const from = calendar ? goalStart(calendar, today, v.from) : v.from || today;
  const range = calendar ? { starts_on: from, ends_on: calendar.ends_on } : lengthOk ? lengthRange(from, n, v.len_unit) : { starts_on: from, ends_on: from };
  const days = daysBetween(range.starts_on, range.ends_on) + 1;
  // Switching period starts it again: today for a running calendar period (or its first day), today for a custom length.
  const move = (period: Period, on: string) =>
    period === "custom" ? { period, on, from: v.period === "custom" ? from : today } : { period, on, from: goalStart(periodRange(period, on || today), today) };
  const money = v.template === "income" || v.template === "savings";
  const options = parents.filter((p) => p.id !== goal?.id && canContain(p, range));

  async function save() {
    setBusy(true);
    const target = v.target.trim() === "" ? null : Number(v.target.replace(/,/g, ""));
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      setBusy(false);
      return setErrors({ target: "Enter a number above 0, or leave it empty" });
    }
    if (custom && !lengthOk) {
      setBusy(false);
      return setErrors({ length_n: "Enter 1 to 999" });
    }
    const { len_n: _n, len_unit: _u, ...rest } = v;
    const r = await saveGoal({ ...rest, from, length_n: custom ? n : null, length_unit: custom ? v.len_unit : null, id: goal?.id, parent_id: v.parent_id || null, target, unit: money ? v.unit || "LKR" : v.unit });
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
        <Field label="How long" labelAs="legend">
          <RadioCards
            name="period"
            columns={4}
            compact
            value={v.period}
            onChange={(p) => setV({ ...v, ...move(p as Period, v.on), parent_id: "" })}
            options={[
              { value: "year", label: "A year" },
              { value: "month", label: "A month" },
              { value: "week", label: "A week" },
              { value: "custom", label: "Set length" },
            ]}
          />
        </Field>
        {calendar ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Which one" hint={periodLabel({ period: v.period, ...calendar })}>
              <Input type="date" value={v.on} onChange={(e) => setV({ ...v, ...move(v.period, e.target.value) })} />
            </Field>
            <Field
              label="Start counting from"
              hint={from === calendar.starts_on ? "From the first day." : "The days before don't count against you."}
            >
              <Input type="date" value={from} min={calendar.starts_on} max={calendar.ends_on} onChange={(e) => setV({ ...v, from: e.target.value })} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[110px_1fr_1fr]">
            <Field label="Length" error={errors.length_n} required>
              <Input inputMode="numeric" value={v.len_n} maxLength={3} onChange={(e) => setV({ ...v, len_n: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="Of" required>
              <Select value={v.len_unit} onChange={(e) => setV({ ...v, len_unit: e.target.value as LengthUnit })} options={LENGTH_UNITS} />
            </Field>
            <Field label="Starts on" required>
              <Input type="date" value={from} onChange={(e) => setV({ ...v, from: e.target.value || today })} />
            </Field>
          </div>
        )}
        <p className="-mt-2 type-small text-ink-muted">
          {custom && !lengthOk
            ? "Enter how many days, weeks, months or years (1 to 999)."
            : `Runs ${shortDate(range.starts_on)} ${range.starts_on.slice(0, 4)} → ${shortDate(range.ends_on)} ${range.ends_on.slice(0, 4)} · ${custom ? `${lengthText(n, v.len_unit)}, ` : ""}${days} day${days === 1 ? "" : "s"}. The pace line starts on day one.`}
        </p>
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
