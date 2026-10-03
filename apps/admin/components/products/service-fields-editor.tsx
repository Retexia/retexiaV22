"use client";

import { Badge, Button, Card, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { ConfirmDialog, SortableList } from "@retexia/ui/admin";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, reorder, saveServiceField } from "@/app/(panel)/products/actions";

export type ServiceField = {
  id?: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "url" | "select" | "toggle" | "date" | "secret";
  options: { value: string; label: string }[];
  help_text: string;
  visible_to_customer: boolean;
  required_for_status: string | null;
  is_visible: boolean;
};

const TYPES: { value: ServiceField["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "url", label: "Link" },
  { value: "select", label: "Choice list" },
  { value: "toggle", label: "Yes / no" },
  { value: "date", label: "Date" },
  { value: "secret", label: "Secret (token, password)" },
];

const toKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 40);

const blank = (): ServiceField => ({ key: "", label: "", type: "text", options: [], help_text: "", visible_to_customer: false, required_for_status: null, is_visible: true });

/**
 * Fields the team fills in while setting a customer up (bot name, phone
 * number id, access token…). Shown on the request's Setup tab and sent to n8n.
 */
export function ServiceFieldsEditor({ productId, fields, statuses }: { productId: string; fields: (ServiceField & { id: string })[]; statuses: { key: string; label: string }[] }) {
  const router = useRouter();
  const [items, setItems] = useState(fields);
  const [edit, setEdit] = useState<ServiceField | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<(ServiceField & { id: string }) | null>(null);
  const statusLabel = (k: string | null) => statuses.find((s) => s.key === k)?.label ?? k;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await saveServiceField({ ...edit, productId, options: edit.type === "select" ? edit.options.filter((o) => o.value && o.label) : [] });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    setEdit(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl type-body text-ink-muted">
          What your team fills in during setup. Secrets are kept in a private table the website cannot read, shown masked, and only revealed to admins (every reveal is logged).
        </p>
        <Button
          size="sm"
          icon={<Plus aria-hidden size={14} strokeWidth={1.5} />}
          onClick={() => {
            setEdit(blank());
            setKeyTouched(false);
            setErrors({});
          }}
        >
          Add field
        </Button>
      </div>

      {edit ? (
        <Card className="flex flex-col gap-4 border-brand/40!">
          <h2 className="type-h3 text-ink">{edit.id ? `Edit ${edit.label}` : "New service field"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label" error={errors.label} required>
              <Input
                autoFocus
                value={edit.label}
                onChange={(e) => setEdit({ ...edit, label: e.target.value, key: edit.id || keyTouched ? edit.key : toKey(e.target.value) })}
                placeholder="WhatsApp phone number ID"
              />
            </Field>
            <Field label="Key" hint={edit.id ? "Locked: saved data and n8n use this key." : "Used in n8n payloads."} error={errors.key} required>
              <Input
                value={edit.key}
                disabled={Boolean(edit.id)}
                onChange={(e) => {
                  setKeyTouched(true);
                  setEdit({ ...edit, key: toKey(e.target.value) });
                }}
                className="font-mono"
              />
            </Field>
            <Field label="Type" required>
              <Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: (e.target.value || "text") as ServiceField["type"] })} options={TYPES} />
            </Field>
            <Field label="Required before" hint="The request can't move to this status until the field is filled." optionalLabel="Optional">
              <Select value={edit.required_for_status ?? ""} onChange={(e) => setEdit({ ...edit, required_for_status: e.target.value || null })} options={statuses.map((s) => ({ value: s.key, label: s.label }))} placeholder="Never required" />
            </Field>
            <Field label="Help text" optionalLabel="Optional" className="sm:col-span-2">
              <Textarea rows={2} value={edit.help_text} onChange={(e) => setEdit({ ...edit, help_text: e.target.value })} placeholder="Where to find it, e.g. Meta Business Suite → WhatsApp → API setup" />
            </Field>
          </div>
          {edit.type === "select" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 type-label text-ink">Choices</legend>
              {edit.options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label="Choice label" value={o.label} placeholder="Label" onChange={(e) => setEdit({ ...edit, options: edit.options.map((x, j) => (j === i ? { label: e.target.value, value: x.value || toKey(e.target.value) } : x)) })} />
                  <Input aria-label="Choice value" className="font-mono" value={o.value} placeholder="value" onChange={(e) => setEdit({ ...edit, options: edit.options.map((x, j) => (j === i ? { ...x, value: toKey(e.target.value) } : x)) })} />
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, options: edit.options.filter((_, j) => j !== i) })} icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}>
                    <span className="sr-only">Remove choice</span>
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEdit({ ...edit, options: [...edit.options, { value: "", label: "" }] })}>
                Add choice
              </Button>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-6">
            <Switch
              checked={edit.type !== "secret" && edit.visible_to_customer}
              disabled={edit.type === "secret"}
              onCheckedChange={(v) => setEdit({ ...edit, visible_to_customer: v })}
              label="Customer can see it"
              description={edit.type === "secret" ? "Secrets are never shown to customers." : "Shown on the customer's order page."}
            />
            <Switch checked={edit.is_visible} onCheckedChange={(v) => setEdit({ ...edit, is_visible: v })} label="In use" description="Turn off to hide without losing saved values." />
          </div>
          <div className="flex gap-2">
            <Button loading={busy} onClick={save}>
              Save field
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {items.length ? (
        <SortableList
          items={items}
          getId={(f) => f.id}
          getLabel={(f) => f.label}
          className="flex flex-col gap-2"
          onReorder={async (ids) => {
            setItems(ids.map((i) => items.find((f) => f.id === i)!));
            const r = await reorder({ table: "product_service_fields", ids });
            if (!r.ok) toast.error(r.message);
          }}
          renderItem={(f, handle) => (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-raised px-3 py-2.5">
              {handle}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="type-label text-ink">{f.label}</span>
                  <span className="type-code text-ink-muted">{f.key}</span>
                </span>
                {f.help_text ? <span className="truncate type-small text-ink-muted">{f.help_text}</span> : null}
              </div>
              <span className="flex flex-wrap gap-1.5">
                <Badge tone={f.type === "secret" ? "warning" : "neutral"}>{TYPES.find((t) => t.value === f.type)?.label ?? f.type}</Badge>
                {f.visible_to_customer ? <Badge tone="brand">Customer sees</Badge> : null}
                {f.required_for_status ? <Badge tone="neutral">Required for {statusLabel(f.required_for_status)}</Badge> : null}
                {!f.is_visible ? <Badge tone="neutral">Not in use</Badge> : null}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />}
                onClick={() => {
                  setEdit(f);
                  setErrors({});
                }}
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(f)}>
                <span className="sr-only">Delete {f.label}</span>
              </Button>
            </div>
          )}
        />
      ) : edit ? null : (
        <Card>
          <p className="type-body text-ink-muted">No service fields yet. Add what your team needs to record during setup.</p>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete “${remove?.label}”?`}
        description="Values already saved on requests stay in their data but are no longer shown. To keep them visible, turn “In use” off instead."
        confirmLabel="Delete field"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteRow({ table: "product_service_fields", id: remove.id });
          toast[r.ok ? "success" : "error"](r.ok ? "Field deleted" : r.message);
          setRemove(null);
          if (r.ok) {
            setItems(items.filter((i) => i.id !== remove.id));
            router.refresh();
          }
        }}
      />
    </div>
  );
}
