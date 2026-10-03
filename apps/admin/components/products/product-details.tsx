"use client";

import { Alert, Button, Card, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { ConfirmDialog, SortableList, useUnsavedChanges } from "@retexia/ui/admin";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, reorder, saveProductFeature, updateProduct } from "@/app/(panel)/products/actions";
import { ColorPair, colorWarnings, type ProductColors } from "./color-pair";
import { IconPicker } from "./icon-picker";
import { slugify } from "./package-editor";
import { ProductIcon } from "./product-icon";

export type ProductDetailsValue = ProductColors & {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  code: string;
  icon: string;
  tagline: string;
  description: string;
  status: string;
  page_slug: string;
  panel_url: string;
  panel_live: boolean;
  onboarding_form_id: string;
};

export type ChecklistItem = { label: string; done: boolean };

const STATUS_OPTIONS = [
  { value: "hidden", label: "Hidden", description: "Not on the website. Only the team sees it." },
  { value: "coming_soon", label: "Coming soon", description: "Product page with a waitlist; no ordering." },
  { value: "live", label: "Live", description: "In menus, pricing and ordering." },
];

export function ProductDetailsForm({
  initial,
  others,
  pages,
  forms,
  hasOrders,
  checklist,
}: {
  initial: ProductDetailsValue;
  others: { name: string; color_light: string }[];
  pages: { slug: string; title: string }[];
  forms: { id: string; title: string }[];
  hasOrders: boolean;
  checklist: ChecklistItem[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmLive, setConfirmLive] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const set = <K extends keyof ProductDetailsValue>(k: K, val: ProductDetailsValue[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    setBusy(true);
    const { id, ...rest } = v;
    const changes = Object.fromEntries(
      Object.entries(rest)
        .filter(([k, val]) => val !== initial[k as keyof ProductDetailsValue])
        .map(([k, val]) => [k, ["tagline", "description", "page_slug", "onboarding_form_id", "icon"].includes(k) && val === "" ? null : val]),
    );
    const r = await updateProduct({ id, changes });
    setBusy(false);
    if (!r.ok) {
      setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => [k.replace(/^changes\./, ""), m])));
      return toast.error(r.message);
    }
    setErrors({});
    toast.success(r.message ?? "Saved");
    if (v.slug !== initial.slug) router.replace(`/products/${v.slug}?tab=details`);
    else router.refresh();
  };

  const onSave = () => (v.status === "live" && initial.status !== "live" ? setConfirmLive(true) : save());
  const warnings = colorWarnings(v, others);
  const missing = checklist.filter((c) => !c.done);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <h2 className="type-h2 text-ink">Basics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} required>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Short name" error={errors.short_name} required>
            <Input value={v.short_name} onChange={(e) => set("short_name", e.target.value)} />
          </Field>
          <Field label="Web address" hint={hasOrders ? "Changing it breaks old links. Existing requests are unaffected." : `retexia.com/${v.slug}`} error={errors.slug} required>
            <Input value={v.slug} onChange={(e) => set("slug", slugify(e.target.value))} />
          </Field>
          <Field label="Request code" hint={hasOrders ? "Locked: requests already use this code." : "Three capital letters."} error={errors.code} required>
            <Input value={v.code} maxLength={3} disabled={hasOrders} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
          </Field>
          <IconPicker value={v.icon} onChange={(icon) => set("icon", icon)} />
          <Field label="Tagline" optionalLabel="Optional" className="sm:col-span-2">
            <Input value={v.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Description" optionalLabel="Optional" className="sm:col-span-2">
            <Textarea rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="type-h2 text-ink">Status</h2>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Product status">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={v.status === o.value}
              onClick={() => set("status", o.value)}
              className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-hover focus-visible:focus-ring ${v.status === o.value ? "border-brand bg-brand-soft/60" : "border-line hover:border-line-strong"}`}
            >
              <span className="type-label text-ink">{o.label}</span>
              <span className="type-small text-ink-muted">{o.description}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product page" hint="The website page for this product." optionalLabel="Optional">
            <Select value={v.page_slug} onChange={(e) => set("page_slug", e.target.value)} options={pages.map((p) => ({ value: p.slug, label: `${p.title} (/${p.slug})` }))} placeholder="No page" />
          </Field>
          <Field label="Onboarding form" optionalLabel="Optional">
            <Select value={v.onboarding_form_id} onChange={(e) => set("onboarding_form_id", e.target.value)} options={forms.map((f) => ({ value: f.id, label: f.title }))} placeholder="No form" />
          </Field>
          <Field label="Customer panel URL" hint="Where customers manage this product, e.g. https://lingo.retexia.com" error={errors.panel_url} optionalLabel="Optional">
            <Input type="url" value={v.panel_url} onChange={(e) => set("panel_url", e.target.value)} placeholder="https://" />
          </Field>
          <div className="flex items-end pb-2">
            <Switch checked={v.panel_live} onCheckedChange={(c) => set("panel_live", c)} label="Panel is live" description="Shows “Open panel” on active orders." />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="type-h2 text-ink">Colour</h2>
        <ColorPair value={v} onChange={(c) => setV((x) => ({ ...x, ...c }))} name={v.short_name} others={others} />
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-full border border-line bg-surface-raised/95 px-4 py-2 shadow-float backdrop-blur">
        <span className="type-small text-ink-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setV(initial)}>
            Discard
          </Button>
          <Button size="sm" loading={busy} disabled={!dirty} onClick={onSave}>
            Save
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmLive}
        onOpenChange={setConfirmLive}
        danger={false}
        title={`Make ${v.short_name} live?`}
        description="It will appear in the website menu, on pricing pages and customers can order it."
        confirmLabel="Make it live"
        onConfirm={async () => {
          setConfirmLive(false);
          await save();
        }}
      >
        <ul className="flex flex-col gap-1.5">
          {checklist.map((c) => (
            <li key={c.label} className={`type-body ${c.done ? "text-ink" : "text-danger"}`}>
              {c.done ? "✓" : "✗"} {c.label}
            </li>
          ))}
        </ul>
        {missing.length || warnings.length ? (
          <Alert tone="warning" className="mt-3">
            {missing.length ? `${missing.length} item${missing.length === 1 ? "" : "s"} not done yet. ` : ""}
            {warnings.length ? "The colour check has warnings." : ""}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

type Feature = { id: string; icon: string; title: string; description: string };

/** "What it does" cards shown on the product page and in menus. */
export function ProductFeaturesEditor({ productId, features }: { productId: string; features: Feature[] }) {
  const router = useRouter();
  const [items, setItems] = useState(features);
  const [edit, setEdit] = useState<Partial<Feature> | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<Feature | null>(null);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await saveProductFeature({ id: edit.id, productId, icon: edit.icon ?? "", title: edit.title ?? "", description: edit.description ?? "" });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Saved");
    setEdit(null);
    router.refresh();
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">Product features</h2>
          <p className="type-small text-ink-muted">Short benefit cards. Shown in the menu and where a page section uses product features.</p>
        </div>
        <Button size="sm" variant="secondary" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEdit({ icon: "check", title: "", description: "" })}>
          Add
        </Button>
      </div>
      {items.length ? (
        <SortableList
          items={items}
          getId={(f) => f.id}
          getLabel={(f) => f.title}
          onReorder={async (ids) => {
            setItems(ids.map((i) => items.find((f) => f.id === i)!));
            const r = await reorder({ table: "product_features", ids });
            if (!r.ok) toast.error(r.message);
          }}
          renderItem={(f, handle) => (
            <div className="flex items-center gap-3 rounded-md border border-line bg-surface-raised p-3">
              {handle}
              <ProductIcon name={f.icon} className="shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="type-label text-ink">{f.title}</p>
                <p className="truncate type-small text-ink-muted">{f.description}</p>
              </div>
              <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEdit(f)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(f)}>
                <span className="sr-only">Delete {f.title}</span>
              </Button>
            </div>
          )}
        />
      ) : (
        <p className="type-body text-ink-muted">No features yet.</p>
      )}
      {edit ? (
        <div className="flex flex-col gap-4 rounded-lg border border-brand/40 bg-brand-soft/30 p-4">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <IconPicker value={edit.icon ?? ""} onChange={(icon) => setEdit({ ...edit, icon })} />
            <Field label="Title" required>
              <Input value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus />
            </Field>
            <Field label="Description" className="sm:col-span-2" optionalLabel="Optional">
              <Textarea rows={2} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={save}>
              Save feature
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete “${remove?.title}”?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteRow({ table: "product_features", id: remove.id });
          toast[r.ok ? "success" : "error"](r.ok ? "Deleted" : r.message);
          setRemove(null);
          if (r.ok) {
            setItems(items.filter((i) => i.id !== remove.id));
            router.refresh();
          }
        }}
      />
    </Card>
  );
}
