"use client";

import { Button, Dialog, Field, Input, RadioCards, Select, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveGoal } from "@/app/plan/actions";
import { CATEGORIES, LENGTH_UNITS, PER, canContain, daysBetween, goalStart, lengthRange, lengthText, periodLabel, periodRange, shortDate, type Category, type Goal, type LengthUnit, type Period } from "@/lib/plan/logic";

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
    // A total by the end (150 orders this month), or a rate to reach by the end (100 orders a day).
    target_type: "total" as "total" | "rate",
    per: "day" as "day" | "week" | "month",
    baseline: "",
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
  // Per week needs 2+ weeks to grow, per month 2+ months (same rule as the server).
  const pers = (["day", "week", "month"] as const).filter((x) => x === "day" || (x === "week" ? days >= 14 : days >= 56));
  const per = pers.includes(v.per) ? v.per : "day";
  const isRate = v.target_type === "rate";
  const unitWord = money ? v.unit || "LKR" : v.unit;

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
    const baseline = !isRate || v.baseline.trim() === "" ? null : Number(v.baseline.replace(/,/g, ""));
    if (baseline !== null && (!Number.isFinite(baseline) || baseline < 0)) {
      setBusy(false);
      return setErrors({ baseline: "Enter a number, or leave it empty" });
    }
    if (isRate && target === null) {
      setBusy(false);
      return setErrors({ target: `Enter the number you want to reach ${PER[per]}` });
    }
    const { len_n: _n, len_unit: _u, baseline: _b, ...rest } = v;
    const r = await saveGoal({ ...rest, per, baseline, from, length_n: custom ? n : null, length_unit: custom ? v.len_unit : null, id: goal?.id, parent_id: v.parent_id || null, target, unit: money ? v.unit || "LKR" : v.unit });
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
            placeholder={isRate ? (money ? "e.g. Earn LKR 20,000 a day by the end of the month" : "e.g. 100 orders a day by the end of the month") : v.template === "income" ? "e.g. Earn LKR 300,000 this month" : v.template === "savings" ? "e.g. Save LKR 100,000" : v.template === "habit" ? "e.g. Read every day" : "e.g. Launch my online shop"}
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
          <>
            <Field label="What do you want to reach?" labelAs="legend">
              <RadioCards
                name="target_type"
                columns={2}
                value={v.target_type}
                onChange={(t) => setV({ ...v, target_type: t as "total" | "rate" })}
                options={[
                  { value: "total", label: "A total by the end", description: money ? "e.g. LKR 300,000 this month. Every amount adds up." : "e.g. 150 orders this month. Every value adds up." },
                  { value: "rate", label: "Every day, week or month", description: money ? "e.g. LKR 20,000 a day by the end. Grow it step by step." : "e.g. 100 orders a day by the end. Grow it step by step." },
                ]}
              />
            </Field>
            {isRate ? (
              <Field label="Per" labelAs="legend" error={errors.per}>
                <RadioCards
                  name="per"
                  columns={3}
                  compact
                  value={per}
                  onChange={(x) => setV({ ...v, per: x as "day" | "week" | "month" })}
                  options={pers.map((x) => ({ value: x, label: x === "day" ? "Day" : x === "week" ? "Week" : "Month" }))}
                />
              </Field>
            ) : null}
            <div className={`grid gap-4 ${isRate ? "sm:grid-cols-[1fr_1fr_140px]" : "sm:grid-cols-[1fr_140px]"}`}>
              <Field
                label={isRate ? `Target ${PER[per]} by the end` : "Target"}
                hint={isRate ? "The level to reach and keep." : money ? "The amount you want to reach." : "A number to reach (leave empty if there isn't one)."}
                error={errors.target}
                required={isRate}
                optionalLabel={isRate ? undefined : "Optional"}
              >
                <Input inputMode="decimal" value={v.target} placeholder={isRate ? (money ? "20000" : "100") : money ? "300000" : "e.g. 20"} onChange={(e) => setV({ ...v, target: e.target.value })} />
              </Field>
              {isRate ? (
                <Field label={`Now, ${PER[per]}`} hint="Where you start. Empty: your first day logged." error={errors.baseline} optionalLabel="Optional">
                  <Input inputMode="decimal" value={v.baseline} placeholder={money ? "8000" : "40"} onChange={(e) => setV({ ...v, baseline: e.target.value })} />
                </Field>
              ) : null}
              <Field label="Unit">
                <Input value={unitWord} maxLength={20} placeholder={money ? "LKR" : "e.g. orders, clients"} onChange={(e) => setV({ ...v, unit: e.target.value })} />
              </Field>
            </div>
            {isRate && v.target.trim() ? (
              <p className="-mt-2 type-small text-ink-muted">
                You log each {per}&apos;s count. The chart shows a bar per {per} and a ramp{v.baseline.trim() ? ` from ${v.baseline.trim()}` : ""} up to {v.target.trim()}
                {unitWord ? ` ${unitWord}` : ""} {PER[per]} on {shortDate(range.ends_on)}, so you can see if each {per} is high enough.
              </p>
            ) : null}
          </>
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
