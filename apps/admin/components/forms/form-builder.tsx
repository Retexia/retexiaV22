"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FIELD_TYPES, type FieldType, type FormDef, type ShowIf } from "@retexia/forms";
import { FormPreview } from "@retexia/forms/react";
import { Alert, Badge, Button, Card, Checkbox, CheckboxGroup, Field, Input, Select, Switch, Tabs, Textarea, cn } from "@retexia/ui";
import { useUnsavedChanges } from "@retexia/ui/admin";
import { ArrowDown, ArrowUp, Eye, EyeOff, GitBranch, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { saveForm, type FormSaveInput } from "@/app/(panel)/forms/actions";

type Option = { value: string; label: string; description?: string | null };
export type FieldDraft = {
  cid: string;
  id?: string;
  key: string;
  label: string;
  type: FieldType;
  placeholder: string;
  help_text: string;
  options: Option[];
  required: boolean;
  min: string;
  max: string;
  default_value: string;
  show_if: ShowIf | null;
  width: "full" | "half";
  prefill_from: string;
  is_visible: boolean;
};
export type StepDraft = { cid: string; id?: string; title: string; description: string; is_visible: boolean; fields: FieldDraft[] };
export type FormMeta = { id: string; slug: string; product_id: string | null; title: string; description: string; submit_label: string; success_title: string; success_message: string; version: number };

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  url: "Website link",
  select: "Dropdown",
  radio: "Single choice",
  radio_cards: "Choice cards",
  checkbox_group: "Multiple choice",
  checkbox: "Tick box (agree)",
  toggle: "Yes / no switch",
};
const CHOICE_TYPES: FieldType[] = ["select", "radio", "radio_cards", "checkbox_group"];
const PREFILL = [
  { value: "profile.full_name", label: "Their name" },
  { value: "profile.phone", label: "Their phone" },
  { value: "profile.whatsapp", label: "Their WhatsApp" },
  { value: "profile.business_name", label: "Their business name" },
  { value: "user.email", label: "Their email" },
];

let seq = 0;
const cid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
const toKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "q_$1")
    .slice(0, 50) || "question";

function newField(existing: string[]): FieldDraft {
  let key = "new_question";
  for (let i = 2; existing.includes(key); i++) key = `new_question_${i}`;
  return { cid: cid(), key, label: "", type: "text", placeholder: "", help_text: "", options: [], required: false, min: "", max: "", default_value: "", show_if: null, width: "full", prefill_from: "", is_visible: true };
}

/** Builder state → the FormDef the website renders (for the live preview). */
function toFormDef(meta: FormMeta, steps: StepDraft[]): FormDef {
  return {
    id: meta.id,
    slug: meta.slug,
    product_id: meta.product_id,
    title: meta.title,
    description: meta.description || null,
    submit_label: meta.submit_label || null,
    success_title: meta.success_title || null,
    success_message: meta.success_message || null,
    version: meta.version,
    steps: steps
      .filter((s) => s.is_visible)
      .map((s, i) => ({
        id: s.cid,
        step_number: i + 1,
        title: s.title || `Step ${i + 1}`,
        description: s.description || null,
        fields: s.fields
          .filter((f) => f.is_visible)
          .map((f) => ({
            id: f.cid,
            key: f.key,
            label: f.label || f.key,
            type: f.type,
            placeholder: f.placeholder || null,
            help_text: f.help_text || null,
            options: f.options.filter((o) => o.value && o.label),
            required: f.required,
            min: f.min === "" ? null : Number(f.min),
            max: f.max === "" ? null : Number(f.max),
            default_value: f.default_value || null,
            show_if: f.show_if,
            width: f.width,
            prefill_from: null,
          })),
      }))
      .filter((s) => s.fields.length > 0),
  };
}

function toPayload(meta: FormMeta, steps: StepDraft[]): FormSaveInput {
  const nul = (v: string) => (v.trim() ? v : null);
  return {
    id: meta.id,
    title: meta.title,
    description: nul(meta.description),
    submit_label: nul(meta.submit_label),
    success_title: nul(meta.success_title),
    success_message: nul(meta.success_message),
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: nul(s.description),
      is_visible: s.is_visible,
      fields: s.fields.map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        placeholder: nul(f.placeholder),
        help_text: nul(f.help_text),
        options: CHOICE_TYPES.includes(f.type) ? f.options.filter((o) => o.value && o.label).map((o) => ({ value: o.value, label: o.label, description: o.description || null })) : [],
        required: f.required,
        min: f.min === "" ? null : Number(f.min),
        max: f.max === "" ? null : Number(f.max),
        default_value: nul(f.default_value),
        show_if: f.show_if,
        width: f.width,
        prefill_from: (nul(f.prefill_from) as FormSaveInput["steps"][number]["fields"][number]["prefill_from"]) ?? null,
        is_visible: f.is_visible,
      })),
    })),
  };
}

export function FormBuilder({ meta: initialMeta, steps: initialSteps, lockedKeys, usedBy }: { meta: FormMeta; steps: StepDraft[]; lockedKeys: string[]; usedBy: string[] }) {
  const router = useRouter();
  const [meta, setMeta] = useState(initialMeta);
  const [steps, setSteps] = useState(initialSteps);
  const [selected, setSelected] = useState<string | null>(initialSteps[0]?.fields[0]?.cid ?? null);
  const [tab, setTab] = useState("build");
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [keyTouched, setKeyTouched] = useState<Record<string, boolean>>({});
  const baseline = useMemo(() => JSON.stringify([initialMeta, initialSteps]), [initialMeta, initialSteps]);
  const dirty = JSON.stringify([meta, steps]) !== baseline;
  useUnsavedChanges(dirty);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const allFields = steps.flatMap((s) => s.fields);
  const originalKey = useMemo(() => new Map(initialSteps.flatMap((s) => s.fields).filter((f) => f.id).map((f) => [f.id!, f.key])), [initialSteps]);
  const isLocked = (f: FieldDraft) => Boolean(f.id && lockedKeys.includes(originalKey.get(f.id) ?? ""));
  const keyCounts = allFields.reduce<Record<string, number>>((m, f) => ({ ...m, [f.key]: (m[f.key] ?? 0) + 1 }), {});
  const problems = [
    ...Object.entries(keyCounts)
      .filter(([, n]) => n > 1)
      .map(([k]) => `Two questions use the key “${k}”.`),
    ...allFields.filter((f) => !f.label.trim()).map((f) => `A question (${f.key}) has no label.`),
    ...allFields.filter((f) => CHOICE_TYPES.includes(f.type) && f.options.filter((o) => o.value && o.label).length < 2).map((f) => `“${f.label || f.key}” needs at least two choices.`),
    ...allFields.filter((f) => f.show_if && !allFields.some((x) => x.key === f.show_if!.field && x.cid !== f.cid)).map((f) => `“${f.label || f.key}” depends on a question that no longer exists.`),
    ...steps.filter((s) => !s.title.trim()).map((_, i) => `Step ${i + 1} has no title.`),
  ];

  const findStep = (fieldCid: string) => steps.findIndex((s) => s.fields.some((f) => f.cid === fieldCid));
  const updateField = (fieldCid: string, patch: Partial<FieldDraft>) =>
    setSteps((all) => all.map((s) => ({ ...s, fields: s.fields.map((f) => (f.cid === fieldCid ? { ...f, ...patch } : f)) })));
  const updateStep = (stepCid: string, patch: Partial<StepDraft>) => setSteps((all) => all.map((s) => (s.cid === stepCid ? { ...s, ...patch } : s)));
  const moveField = (fieldCid: string, toStep: number, toIndex?: number) =>
    setSteps((all) => {
      const from = all.findIndex((s) => s.fields.some((f) => f.cid === fieldCid));
      if (from < 0 || !all[toStep]) return all;
      const field = all[from]!.fields.find((f) => f.cid === fieldCid)!;
      const next = all.map((s) => ({ ...s, fields: s.fields.filter((f) => f.cid !== fieldCid) }));
      const target = next[toStep]!.fields;
      target.splice(toIndex ?? target.length, 0, field);
      return next;
    });

  const onDragOver = (e: DragOverEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;
    const from = findStep(activeId);
    const to = overId.startsWith("drop:") ? steps.findIndex((s) => `drop:${s.cid}` === overId) : findStep(overId);
    if (from < 0 || to < 0 || from === to) return;
    const index = overId.startsWith("drop:") ? steps[to]!.fields.length : steps[to]!.fields.findIndex((f) => f.cid === overId);
    moveField(activeId, to, index < 0 ? undefined : index);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId || overId.startsWith("drop:")) return;
    const si = findStep(activeId);
    if (si < 0 || findStep(overId) !== si) return;
    setSteps((all) =>
      all.map((s, i) => {
        if (i !== si) return s;
        const a = s.fields.findIndex((f) => f.cid === activeId);
        const b = s.fields.findIndex((f) => f.cid === overId);
        return { ...s, fields: arrayMove(s.fields, a, b) };
      }),
    );
  };

  const save = async () => {
    if (problems.length) return toast.error(problems[0]!);
    setBusy(true);
    const r = await saveForm(toPayload(meta, steps));
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Saved");
    router.refresh();
  };

  const sel = allFields.find((f) => f.cid === selected) ?? null;
  const selStep = sel ? findStep(sel.cid) : -1;
  const earlier = sel ? steps.flatMap((s) => s.fields).slice(0, steps.flatMap((s) => s.fields).findIndex((f) => f.cid === sel.cid)) : [];

  return (
    <div className="flex flex-col gap-6">
      {usedBy.length ? <Alert tone="info">Used by {usedBy.join(", ")}. Saving changes the form on the website straight away; existing requests keep their answers.</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          idPrefix="form-builder"
          label="Form builder"
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            if (v === "preview") setPreviewKey((k) => k + 1);
          }}
          items={[
            { value: "build", label: "Questions" },
            { value: "preview", label: "Preview" },
            { value: "settings", label: "Texts" },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="type-small text-ink-muted">{dirty ? "Unsaved changes" : `Version ${initialMeta.version}`}</span>
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => (setMeta(initialMeta), setSteps(initialSteps))}>
            Discard
          </Button>
          <Button size="sm" loading={busy} disabled={!dirty} onClick={save}>
            Save form
          </Button>
        </div>
      </div>
      {problems.length && dirty ? (
        <Alert tone="warning" title="Fix before saving">
          <ul className="list-disc pl-5">
            {problems.slice(0, 5).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {tab === "build" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            <ol className="flex flex-col gap-4">
              {steps.map((s, si) => (
                <StepCard
                  key={s.cid}
                  step={s}
                  index={si}
                  count={steps.length}
                  selected={selected}
                  lockedKeys={lockedKeys}
                  originalKey={originalKey}
                  onSelect={setSelected}
                  onChange={(patch) => updateStep(s.cid, patch)}
                  onMove={(dir) => setSteps((all) => arrayMove(all, si, si + dir))}
                  onRemove={() => {
                    if (s.fields.some((f) => isLocked(f)) && !window.confirm("Customers answered questions in this step. Old requests keep their answers. Delete the step?")) return;
                    setSteps((all) => all.filter((x) => x.cid !== s.cid));
                  }}
                  onAddField={() => {
                    const f = newField(allFields.map((x) => x.key));
                    updateStep(s.cid, { fields: [...s.fields, f] });
                    setSelected(f.cid);
                    setKeyTouched((t) => ({ ...t, [f.cid]: false }));
                  }}
                />
              ))}
              <li>
                <Button
                  variant="secondary"
                  icon={<Plus aria-hidden size={16} strokeWidth={1.5} />}
                  onClick={() => setSteps((all) => [...all, { cid: cid(), title: `Step ${all.length + 1}`, description: "", is_visible: true, fields: [] }])}
                >
                  Add step
                </Button>
              </li>
            </ol>
          </DndContext>

          <div className="lg:sticky lg:top-20 lg:self-start">
            {sel ? (
              <Card className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="type-h3 text-ink">Question</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger!"
                    icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                    onClick={() => {
                      if (isLocked(sel) && !window.confirm("Customers already answered this question. Old requests keep their answers. Delete it?")) return;
                      setSteps((all) => all.map((s) => ({ ...s, fields: s.fields.filter((f) => f.cid !== sel.cid) })));
                      setSelected(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Question" required className="sm:col-span-2">
                    <Input
                      autoFocus
                      value={sel.label}
                      onChange={(e) => updateField(sel.cid, { label: e.target.value, ...(!sel.id && !keyTouched[sel.cid] ? { key: toKey(e.target.value) } : {}) })}
                      placeholder="What is your business called?"
                    />
                  </Field>
                  <Field label="Answer type">
                    <Select
                      value={sel.type}
                      onChange={(e) => {
                        const type = (e.target.value || "text") as FieldType;
                        updateField(sel.cid, {
                          type,
                          options: CHOICE_TYPES.includes(type) && sel.options.length === 0 ? [{ value: "option_1", label: "Option 1" }, { value: "option_2", label: "Option 2" }] : sel.options,
                        });
                      }}
                      options={FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                    />
                  </Field>
                  <Field
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        Key {isLocked(sel) ? <Lock aria-hidden size={12} strokeWidth={1.5} /> : null}
                      </span>
                    }
                    hint={isLocked(sel) ? "Locked: customers already answered this." : "How the answer is stored and sent to n8n."}
                  >
                    <Input
                      className="font-mono"
                      value={sel.key}
                      disabled={isLocked(sel)}
                      onChange={(e) => {
                        setKeyTouched((t) => ({ ...t, [sel.cid]: true }));
                        updateField(sel.cid, { key: toKey(e.target.value) });
                      }}
                    />
                  </Field>
                  <Field label="Help text" hint="Shown under the question. **bold** and [links](https://…) work." optionalLabel="Optional" className="sm:col-span-2">
                    <Textarea rows={2} value={sel.help_text} onChange={(e) => updateField(sel.cid, { help_text: e.target.value })} />
                  </Field>
                  {!["checkbox", "toggle", "radio", "radio_cards", "checkbox_group"].includes(sel.type) ? (
                    <Field label="Placeholder" optionalLabel="Optional">
                      <Input value={sel.placeholder} onChange={(e) => updateField(sel.cid, { placeholder: e.target.value })} />
                    </Field>
                  ) : null}
                  <Field label="Width">
                    <Select value={sel.width} onChange={(e) => updateField(sel.cid, { width: e.target.value === "half" ? "half" : "full" })} options={[{ value: "full", label: "Full width" }, { value: "half", label: "Half (two side by side)" }]} />
                  </Field>
                  {["text", "textarea", "number", "checkbox_group", "url"].includes(sel.type) ? (
                    <>
                      <Field label={sel.type === "number" ? "Lowest value" : sel.type === "checkbox_group" ? "Choose at least" : "Fewest characters"} optionalLabel="Optional">
                        <Input type="number" value={sel.min} onChange={(e) => updateField(sel.cid, { min: e.target.value })} />
                      </Field>
                      <Field label={sel.type === "number" ? "Highest value" : sel.type === "checkbox_group" ? "Choose at most" : "Most characters"} optionalLabel="Optional">
                        <Input type="number" value={sel.max} onChange={(e) => updateField(sel.cid, { max: e.target.value })} />
                      </Field>
                    </>
                  ) : null}
                  <Field label="Starting value" hint={sel.type === "checkbox_group" ? "Comma separated values." : sel.type === "toggle" || sel.type === "checkbox" ? "true or false" : undefined} optionalLabel="Optional">
                    <Input value={sel.default_value} onChange={(e) => updateField(sel.cid, { default_value: e.target.value })} />
                  </Field>
                  {["text", "email", "phone"].includes(sel.type) ? (
                    <Field label="Fill in from their account" optionalLabel="Optional">
                      <Select value={sel.prefill_from} onChange={(e) => updateField(sel.cid, { prefill_from: e.target.value })} options={PREFILL} placeholder="Don't prefill" />
                    </Field>
                  ) : null}
                  <Field label="Step">
                    <Select value={String(selStep)} onChange={(e) => moveField(sel.cid, Number(e.target.value))} options={steps.map((s, i) => ({ value: String(i), label: `${i + 1}. ${s.title || "Untitled"}` }))} />
                  </Field>
                </div>

                {CHOICE_TYPES.includes(sel.type) ? <OptionsEditor options={sel.options} onChange={(options) => updateField(sel.cid, { options })} /> : null}

                <ShowIfEditor value={sel.show_if} candidates={earlier} onChange={(show_if) => updateField(sel.cid, { show_if })} />

                <div className="flex flex-wrap gap-6">
                  <Switch checked={sel.required} onCheckedChange={(v) => updateField(sel.cid, { required: v })} label="Required" />
                  <Switch checked={sel.is_visible} onCheckedChange={(v) => updateField(sel.cid, { is_visible: v })} label="Shown on the form" />
                </div>
              </Card>
            ) : (
              <Card>
                <p className="type-body text-ink-muted">Select a question to edit it, or add one to a step.</p>
              </Card>
            )}
          </div>
        </div>
      ) : null}

      {tab === "preview" ? (
        <div className="mx-auto w-full max-w-3xl">
          <FormPreview key={previewKey} form={toFormDef(meta, steps)} note="Preview with your unsaved changes. Nothing is submitted." />
        </div>
      ) : null}

      {tab === "settings" ? (
        <Card className="flex flex-col gap-4">
          <Field label="Form name" hint="Only the team sees this." required>
            <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </Field>
          <Field label="Intro" hint="Shown above the first step." optionalLabel="Optional">
            <Textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </Field>
          <Field label="Send button" optionalLabel="Optional">
            <Input value={meta.submit_label} onChange={(e) => setMeta({ ...meta, submit_label: e.target.value })} placeholder="Send request" />
          </Field>
          <Field label="Thank-you title" optionalLabel="Optional">
            <Input value={meta.success_title} onChange={(e) => setMeta({ ...meta, success_title: e.target.value })} placeholder="Request received" />
          </Field>
          <Field label="Thank-you message" optionalLabel="Optional">
            <Textarea rows={3} value={meta.success_message} onChange={(e) => setMeta({ ...meta, success_message: e.target.value })} />
          </Field>
        </Card>
      ) : null}
    </div>
  );
}

function StepCard({
  step,
  index,
  count,
  selected,
  lockedKeys,
  originalKey,
  onSelect,
  onChange,
  onMove,
  onRemove,
  onAddField,
}: {
  step: StepDraft;
  index: number;
  count: number;
  selected: string | null;
  lockedKeys: string[];
  originalKey: Map<string, string>;
  onSelect: (cid: string) => void;
  onChange: (patch: Partial<StepDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddField: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${step.cid}` });
  return (
    <li>
      <Card className={cn("flex flex-col gap-3", !step.is_visible && "opacity-70")}>
        <div className="flex items-start gap-2">
          <span className="mt-2 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft type-label text-brand">{index + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              aria-label={`Step ${index + 1} title`}
              value={step.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="h-9 w-full rounded-md border border-transparent bg-transparent px-2 type-h3 text-ink hover:border-line focus-visible:border-brand focus-visible:focus-ring"
            />
            <input
              aria-label={`Step ${index + 1} description`}
              value={step.description}
              placeholder="Short description (optional)"
              onChange={(e) => onChange({ description: e.target.value })}
              className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 type-small text-ink-muted hover:border-line focus-visible:border-brand focus-visible:focus-ring"
            />
          </div>
          <div className="flex shrink-0 items-center">
            <IconButton label="Move step up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp aria-hidden size={14} strokeWidth={1.5} />
            </IconButton>
            <IconButton label="Move step down" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown aria-hidden size={14} strokeWidth={1.5} />
            </IconButton>
            <IconButton label={step.is_visible ? "Hide step" : "Show step"} onClick={() => onChange({ is_visible: !step.is_visible })}>
              {step.is_visible ? <Eye aria-hidden size={14} strokeWidth={1.5} /> : <EyeOff aria-hidden size={14} strokeWidth={1.5} />}
            </IconButton>
            <IconButton label="Delete step" disabled={count === 1} onClick={onRemove}>
              <Trash2 aria-hidden size={14} strokeWidth={1.5} />
            </IconButton>
          </div>
        </div>
        <SortableContext items={step.fields.map((f) => f.cid)} strategy={verticalListSortingStrategy}>
          <ul ref={setNodeRef} className={cn("flex min-h-12 flex-col gap-1.5 rounded-md p-1", isOver && "bg-brand-soft/40")}>
            {step.fields.map((f) => (
              <FieldRow key={f.cid} field={f} active={selected === f.cid} locked={Boolean(f.id && lockedKeys.includes(originalKey.get(f.id) ?? ""))} onSelect={() => onSelect(f.cid)} />
            ))}
            {step.fields.length === 0 ? <li className="px-3 py-3 type-small text-ink-muted">Drop questions here, or add one.</li> : null}
          </ul>
        </SortableContext>
        <Button size="sm" variant="ghost" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={onAddField}>
          Add question
        </Button>
      </Card>
    </li>
  );
}

function FieldRow({ field, active, locked, onSelect }: { field: FieldDraft; active: boolean; locked: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: field.cid });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative", isDragging && "z-10 opacity-80")}>
      <div className={cn("flex items-center gap-2 rounded-md border bg-surface-raised px-2 py-2 transition-hover", active ? "border-brand ring-1 ring-brand" : "border-line hover:border-line-strong")}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${field.label || field.key}`}
          className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunk focus-visible:focus-ring"
        >
          <GripVertical aria-hidden size={14} strokeWidth={1.5} />
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col text-left focus-visible:focus-ring" aria-pressed={active}>
          <span className={cn("truncate type-label", field.label ? "text-ink" : "text-ink-muted italic")}>
            {field.label || "Untitled question"}
            {field.required ? <span className="text-danger"> *</span> : null}
          </span>
          <span className="flex items-center gap-1.5 type-small text-ink-muted">
            <span className="font-mono">{field.key}</span> · {TYPE_LABELS[field.type]}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {field.show_if ? (
            <span title={`Shown only when ${field.show_if.field} matches`} className="text-brand">
              <GitBranch aria-hidden size={14} strokeWidth={1.5} />
              <span className="sr-only">Conditional</span>
            </span>
          ) : null}
          {locked ? (
            <span title="Customers answered this" className="text-ink-muted">
              <Lock aria-hidden size={14} strokeWidth={1.5} />
              <span className="sr-only">Key locked</span>
            </span>
          ) : null}
          {!field.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
          {field.width === "half" ? <Badge tone="neutral">½</Badge> : null}
        </span>
      </div>
    </li>
  );
}

function IconButton({ label, children, onClick, disabled }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function OptionsEditor({ options, onChange }: { options: Option[]; onChange: (o: Option[]) => void }) {
  const set = (i: number, patch: Partial<Option>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 type-label text-ink">Choices</legend>
      {options.map((o, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2">
          <Input aria-label={`Choice ${i + 1} label`} value={o.label} placeholder="Label" onChange={(e) => set(i, { label: e.target.value, ...(o.value === toKey(o.label) || !o.value ? { value: toKey(e.target.value) } : {}) })} />
          <Input aria-label={`Choice ${i + 1} value`} className="font-mono" value={o.value} placeholder="value" onChange={(e) => set(i, { value: toKey(e.target.value) })} />
          <IconButton label="Move up" disabled={i === 0} onClick={() => onChange(arrayMove(options, i, i - 1))}>
            <ArrowUp aria-hidden size={14} strokeWidth={1.5} />
          </IconButton>
          <IconButton label="Move down" disabled={i === options.length - 1} onClick={() => onChange(arrayMove(options, i, i + 1))}>
            <ArrowDown aria-hidden size={14} strokeWidth={1.5} />
          </IconButton>
          <IconButton label="Remove choice" onClick={() => onChange(options.filter((_, j) => j !== i))}>
            <Trash2 aria-hidden size={14} strokeWidth={1.5} />
          </IconButton>
          <Input
            aria-label={`Choice ${i + 1} description`}
            className="col-span-2"
            value={o.description ?? ""}
            placeholder="Description (choice cards only, optional)"
            onChange={(e) => set(i, { description: e.target.value })}
          />
        </div>
      ))}
      <Button size="sm" variant="ghost" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => onChange([...options, { value: `option_${options.length + 1}`, label: `Option ${options.length + 1}` }])}>
        Add choice
      </Button>
    </fieldset>
  );
}

/** "Only show this question when …" */
function ShowIfEditor({ value, candidates, onChange }: { value: ShowIf | null; candidates: FieldDraft[]; onChange: (v: ShowIf | null) => void }) {
  const source = candidates.find((c) => c.key === value?.field);
  const mode: "equals" | "in" | "not_in" = value?.in ? "in" : value?.not_in ? "not_in" : "equals";
  const choices: Option[] = source
    ? CHOICE_TYPES.includes(source.type)
      ? source.options
      : source.type === "checkbox" || source.type === "toggle"
        ? [
            { value: "true", label: "Yes / ticked" },
            { value: "false", label: "No / not ticked" },
          ]
        : []
    : [];
  const list = value?.in ?? value?.not_in ?? (value?.equals !== undefined ? [String(value.equals)] : []);
  const build = (field: string, m: typeof mode, values: string[]): ShowIf => (m === "equals" ? { field, equals: values[0] ?? "" } : m === "in" ? { field, in: values } : { field, not_in: values });

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 type-label text-ink">Conditional</legend>
      <Checkbox
        label="Only show this question depending on an earlier answer"
        checked={Boolean(value)}
        disabled={!candidates.length}
        onChange={(e) => onChange(e.target.checked && candidates[0] ? build(candidates[0].key, "equals", []) : null)}
        description={candidates.length ? undefined : "Add a question before this one first."}
      />
      {value ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="When">
            <Select value={value.field} onChange={(e) => onChange(build(e.target.value, mode, []))} options={candidates.map((c) => ({ value: c.key, label: c.label || c.key }))} />
          </Field>
          <Field label="Answer">
            <Select
              value={mode}
              onChange={(e) => onChange(build(value.field, (e.target.value || "equals") as typeof mode, list))}
              options={[
                { value: "equals", label: "is" },
                { value: "in", label: "is any of" },
                { value: "not_in", label: "is none of" },
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            {choices.length ? (
              mode === "equals" ? (
                <Field label="Value">
                  <Select value={list[0] ?? ""} onChange={(e) => onChange(build(value.field, mode, [e.target.value]))} options={choices.map((c) => ({ value: c.value, label: c.label }))} />
                </Field>
              ) : (
                <Field label="Values" labelAs="legend">
                  <CheckboxGroup name="show-if-values" options={choices.map((c) => ({ value: c.value, label: c.label }))} value={list} onChange={(v) => onChange(build(value.field, mode, v))} columns={2} />
                </Field>
              )
            ) : (
              <Field label={mode === "equals" ? "Value" : "Values"} hint={mode === "equals" ? undefined : "Comma separated."}>
                <Input value={list.join(", ")} onChange={(e) => onChange(build(value.field, mode, e.target.value.split(",").map((s) => s.trim()).filter(Boolean)))} />
              </Field>
            )}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
