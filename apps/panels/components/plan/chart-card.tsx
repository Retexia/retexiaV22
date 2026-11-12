"use client";

import { Badge, Button, Card, Dialog, DropdownMenu, Field, Input, RadioCards } from "@retexia/ui";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { addPoint, deleteChart, deletePoint, saveChart } from "@/app/plan/actions";
import { STATUS_TEXT, chartProgress, chartRows, fmtNum, fmtValue, shortDate, type Chart, type Goal, type Point, type Role } from "@/lib/plan/logic";

const tooltipStyle = { background: "var(--rx-surface-raised)", border: "1px solid var(--rx-line)", borderRadius: 12, color: "var(--rx-ink)", fontSize: 13 };

/** One chart of a goal: the line / bars, where you should be (pace), the target, and "Add value". */
export function ChartCard({ chart, points, goal, role, today, tz, color, names }: { chart: Chart; points: Point[]; goal: Goal; role: Role; today: string; tz: string; color: string; names: Record<string, string> }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ value: "", on: today, label: "", note: "" });
  const [busy, setBusy] = useState(false);
  const rows = chartRows(chart, points, goal, tz);
  const p = chartProgress(chart, points, goal, today);
  const own = points.filter((x) => x.chart_id === chart.id);
  const canAdd = role !== "viewer";
  const status = STATUS_TEXT[p.status];

  async function add() {
    const value = Number(v.value.replace(/,/g, ""));
    if (!Number.isFinite(value) || v.value.trim() === "") return toast.error("Enter a number");
    setBusy(true);
    const r = await addPoint({ chart_id: chart.id, value, on: v.on, label: v.label, note: v.note });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Added");
    setV({ value: "", on: today, label: "", note: "" });
    setAdding(false);
    router.refresh();
  }

  const axis = { stroke: "var(--rx-ink-muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
  const valueFmt = (n: number) => fmtNum(n);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="type-h3 text-ink">{chart.title}</h3>
          <span className="type-small text-ink-muted">
            {fmtValue(p.current, chart.unit)}
            {p.target != null ? ` of ${fmtValue(p.target, chart.unit)}` : ""}
            {p.pct != null ? ` · ${Math.round(p.pct * 100)}%` : ""}
          </span>
        </div>
        <span className="flex items-center gap-1">
          {p.target != null ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          {role === "owner" ? (
            <DropdownMenu
              align="end"
              triggerLabel={`Chart options: ${chart.title}`}
              triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring"
              trigger={<MoreHorizontal aria-hidden size={16} strokeWidth={1.5} />}
              items={[
                { type: "button", label: "Chart settings", icon: <Pencil aria-hidden size={14} strokeWidth={1.5} />, onSelect: () => setEdit(true) },
                {
                  type: "button",
                  label: "Delete chart",
                  danger: true,
                  icon: <Trash2 aria-hidden size={14} strokeWidth={1.5} />,
                  onSelect: async () => {
                    if (!window.confirm(`Delete the chart "${chart.title}" and its ${own.length} values?`)) return;
                    const r = await deleteChart({ id: chart.id });
                    toast[r.ok ? "success" : "error"](r.message ?? "");
                    router.refresh();
                  },
                },
              ]}
            />
          ) : null}
        </span>
      </div>

      <div className="h-56 w-full">
        {own.length ? (
          <ResponsiveContainer width="100%" height="100%">
            {chart.kind === "bar" || chart.x_mode === "labels" ? (
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--rx-line)" />
                <XAxis dataKey="x" {...axis} minTickGap={16} />
                <YAxis {...axis} width={56} tickFormatter={valueFmt} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--rx-surface-sunk)" }} formatter={(n) => [fmtValue(Number(n), chart.unit), chart.title]} />
                {chart.target != null && chart.mode === "value" ? <ReferenceLine y={chart.target} stroke="var(--rx-ink-muted)" strokeDasharray="4 4" /> : null}
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            ) : (
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--rx-line)" />
                <XAxis dataKey="x" {...axis} minTickGap={24} />
                <YAxis {...axis} width={56} tickFormatter={valueFmt} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(n, name) => [n == null ? "–" : fmtValue(Number(n), chart.unit), name === "pace" ? "Where you should be" : chart.title]}
                />
                {chart.target != null ? <ReferenceLine y={chart.target} stroke="var(--rx-ink-muted)" strokeDasharray="4 4" label={{ value: "Target", position: "insideTopRight", fill: "var(--rx-ink-muted)", fontSize: 11 }} /> : null}
                <Line type="monotone" dataKey="pace" stroke="var(--rx-ink-muted)" strokeDasharray="2 4" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-line type-small text-ink-muted">
            {canAdd ? "No values yet: add the first one below." : "No values yet."}
          </div>
        )}
      </div>

      {canAdd ? (
        adding ? (
          <div className="flex flex-col gap-3 rounded-lg bg-surface-sunk p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label={`${chart.mode === "total" ? "Add" : "New value"}${chart.unit ? ` (${chart.unit})` : ""}`}>
                <Input autoFocus inputMode="decimal" value={v.value} placeholder={chart.mode === "total" ? "e.g. 15000" : "e.g. 72.5"} onChange={(e) => setV({ ...v, value: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
              </Field>
              {chart.x_mode === "time" ? (
                <Field label="Day">
                  <Input type="date" max={today} value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} />
                </Field>
              ) : (
                <Field label="For" hint="What this is for (the X axis)">
                  <Input value={v.label} maxLength={60} placeholder="e.g. Instagram" onChange={(e) => setV({ ...v, label: e.target.value })} />
                </Field>
              )}
            </div>
            <Field label="Note" optionalLabel="Optional">
              <Input value={v.note} maxLength={280} placeholder="e.g. 3 orders from TikTok" onChange={(e) => setV({ ...v, note: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={add}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setAdding(true)}>
            Add value
          </Button>
        )
      ) : null}

      {own.length ? (
        <details className="type-small">
          <summary className="cursor-pointer text-ink-muted">Values ({own.length})</summary>
          <ul className="mt-2 flex max-h-56 flex-col divide-y divide-line overflow-y-auto">
            {[...own].reverse().map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-1.5">
                <span className="w-16 shrink-0 text-ink-muted">{x.label ?? shortDate(x.at.slice(0, 10))}</span>
                <span className="type-label text-ink">{fmtValue(x.value, chart.unit)}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">
                  {x.note}
                  {x.created_by && names[x.created_by] && role !== "viewer" ? ` · ${names[x.created_by]}` : ""}
                </span>
                {role === "owner" ? (
                  <button
                    type="button"
                    className="rounded-full p-1 text-ink-muted hover:text-danger focus-visible:focus-ring"
                    onClick={async () => {
                      const r = await deletePoint({ id: x.id });
                      toast[r.ok ? "success" : "error"](r.message ?? "");
                      router.refresh();
                    }}
                  >
                    <Trash2 aria-hidden size={13} strokeWidth={1.5} />
                    <span className="sr-only">Delete this value</span>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {edit ? <ChartDialog open onClose={() => setEdit(false)} goalId={goal.id} chart={chart} /> : null}
    </Card>
  );
}

/** Add or change a chart: what the Y axis tracks (unit, adds up or latest level, target) and the X axis (time or own labels). */
export function ChartDialog({ open, onClose, goalId, chart }: { open: boolean; onClose: () => void; goalId: string; chart?: Chart }) {
  const router = useRouter();
  const [v, setV] = useState({
    title: chart?.title ?? "",
    unit: chart?.unit ?? "",
    x_mode: chart?.x_mode ?? "time",
    grain: chart?.grain ?? "day",
    mode: chart?.mode ?? "total",
    kind: chart?.kind ?? "line",
    target: chart?.target == null ? "" : String(chart.target),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    const target = v.target.trim() === "" ? null : Number(v.target.replace(/,/g, ""));
    if (target !== null && !Number.isFinite(target)) return toast.error("The target must be a number");
    setBusy(true);
    const r = await saveChart({ id: chart?.id, goal_id: goalId, ...v, x_mode: v.x_mode as Chart["x_mode"], grain: v.grain as Chart["grain"], mode: v.mode as Chart["mode"], kind: v.kind as Chart["kind"], target });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Saved");
    onClose();
    router.refresh();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      title={chart ? "Chart settings" : "New chart"}
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
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="What you track (Y axis)" required>
            <Input autoFocus value={v.title} maxLength={80} placeholder="e.g. Income, Weight, Pages read" onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field label="Unit" optionalLabel="Optional">
            <Input value={v.unit} maxLength={20} placeholder="LKR, kg, pages" onChange={(e) => setV({ ...v, unit: e.target.value })} />
          </Field>
        </div>
        <Field label="Each value you add" labelAs="legend">
          <RadioCards
            name="mode"
            columns={2}
            value={v.mode}
            onChange={(mode) => setV({ ...v, mode: mode as Chart["mode"] })}
            options={[
              { value: "total", label: "Adds up", description: "Income, sales, savings, pages: the chart shows the running total." },
              { value: "value", label: "Is the new level", description: "Weight, bank balance, followers: the chart shows the latest value." },
            ]}
          />
        </Field>
        <Field label="Target" hint="Where you want to get to (a dashed line)." optionalLabel="Optional" className="max-w-xs">
          <Input inputMode="decimal" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} />
        </Field>
        <Field label="X axis" labelAs="legend">
          <RadioCards
            name="x_mode"
            columns={2}
            compact
            value={v.x_mode}
            onChange={(x) => setV({ ...v, x_mode: x as Chart["x_mode"] })}
            options={[
              { value: "time", label: "Time (by day, week or month)" },
              { value: "labels", label: "My own labels (products, clients…)" },
            ]}
          />
        </Field>
        {v.x_mode === "time" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Show per" labelAs="legend">
              <RadioCards name="grain" columns={3} compact value={v.grain} onChange={(g) => setV({ ...v, grain: g as Chart["grain"] })} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
            </Field>
            <Field label="Chart" labelAs="legend">
              <RadioCards name="kind" columns={2} compact value={v.kind} onChange={(k) => setV({ ...v, kind: k as Chart["kind"] })} options={[{ value: "line", label: "Line" }, { value: "bar", label: "Bars" }]} />
            </Field>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

export function AddChartButton({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        Add chart
      </Button>
      {open ? <ChartDialog open onClose={() => setOpen(false)} goalId={goalId} /> : null}
    </>
  );
}
