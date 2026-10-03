"use client";

import { Button, Checkbox, Field, Input, PricingCard, Switch, Textarea, formatPrice, type PricingCardData } from "@retexia/ui";
import { SortableList } from "@retexia/ui/admin";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

export type FeatureDraft = { id: string; label: string; included: boolean };
export type PackageDraft = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  setup_fee: string;
  currency: string;
  badge: string;
  is_featured: boolean;
  cta_label: string;
  fine_print: string;
  price_note: string;
  is_active: boolean;
  is_visible: boolean;
  features: FeatureDraft[];
};

let seq = 0;
export const newFeatureId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyPackage(): PackageDraft {
  return {
    slug: "",
    name: "",
    tagline: "",
    description: "",
    price_monthly: "",
    price_yearly: "",
    setup_fee: "0",
    currency: "",
    badge: "",
    is_featured: false,
    cta_label: "",
    fine_print: "",
    price_note: "",
    is_active: true,
    is_visible: true,
    features: [{ id: newFeatureId(), label: "", included: true }],
  };
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Draft → the payload savePackage / admin_create_product expect. */
export function packagePayload(p: PackageDraft) {
  return {
    slug: p.slug || slugify(p.name),
    name: p.name.trim(),
    tagline: p.tagline,
    description: p.description,
    price_monthly: Number(p.price_monthly || 0),
    price_yearly: p.price_yearly === "" ? null : Number(p.price_yearly),
    setup_fee: Number(p.setup_fee || 0),
    currency: p.currency.trim().toUpperCase(),
    badge: p.badge,
    is_featured: p.is_featured,
    cta_label: p.cta_label || `Choose ${p.name.split(" ").pop() ?? p.name}`,
    fine_print: p.fine_print,
    features: p.features.filter((f) => f.label.trim()).map((f) => ({ label: f.label.trim(), included: f.included })),
  };
}

/** Package editor with a live preview of the website's pricing card. */
export function PackageEditor({ value, onChange, currency, slugLocked = false }: { value: PackageDraft; onChange: (p: PackageDraft) => void; currency: string; slugLocked?: boolean }) {
  const id = useId();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const set = <K extends keyof PackageDraft>(k: K, v: PackageDraft[K]) => onChange({ ...value, [k]: v });
  const cur = value.currency || currency;
  const fmt = (v: string) => (v === "" ? "" : formatPrice(Number(v), cur));
  const saving = value.price_yearly !== "" && Number(value.price_monthly) * 12 - Number(value.price_yearly);
  const preview: PricingCardData = {
    id: "preview",
    slug: value.slug || "preview",
    name: value.name || "Package name",
    tagline: value.tagline || null,
    description: value.description || null,
    badge: value.badge || null,
    featured: value.is_featured,
    active: value.is_active,
    ctaLabel: value.cta_label || `Choose ${value.name.split(" ").pop() || "this"}`,
    priceNote: value.price_note || null,
    monthly: fmt(value.price_monthly || "0"),
    yearly: value.price_yearly === "" ? null : fmt(value.price_yearly),
    yearlySaving: saving && saving > 0 ? `You save ${formatPrice(saving, cur)} a year` : null,
    setupFee: Number(value.setup_fee) > 0 ? fmt(value.setup_fee) : null,
    features: value.features.filter((f) => f.label.trim()).map((f) => ({ label: f.label, included: f.included, tooltip: null })),
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value, slug: slugLocked || value.slug ? value.slug : "" })}
              placeholder="Lingo Pro"
            />
          </Field>
          <Field label="Slug" hint={slugLocked ? "Used in links. Locked once customers ordered." : "Used in links: ?package=pro"} required>
            <Input value={value.slug || slugify(value.name.split(" ").pop() ?? "")} disabled={slugLocked} onChange={(e) => set("slug", slugify(e.target.value))} />
          </Field>
          <Field label="Tagline" optionalLabel="Optional" className="sm:col-span-2">
            <Input value={value.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Your own assistant, with automations" />
          </Field>
          <Field label={`Monthly price (${cur})`} required>
            <Input type="number" min={0} step="0.01" value={value.price_monthly} onChange={(e) => set("price_monthly", e.target.value)} />
          </Field>
          <Field label={`Yearly price (${cur})`} hint="Empty = monthly only." optionalLabel="Optional">
            <Input type="number" min={0} step="0.01" value={value.price_yearly} onChange={(e) => set("price_yearly", e.target.value)} />
          </Field>
          <Field label={`Setup fee (${cur})`} required>
            <Input type="number" min={0} step="0.01" value={value.setup_fee} onChange={(e) => set("setup_fee", e.target.value)} />
          </Field>
          <Field label="Currency" hint={`Empty = site currency (${currency}).`} optionalLabel="Optional">
            <Input value={value.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} placeholder={currency} />
          </Field>
          <Field label="Badge" optionalLabel="Optional">
            <Input value={value.badge} onChange={(e) => set("badge", e.target.value)} placeholder="Most popular" />
          </Field>
          <Field label="Button label" optionalLabel="Optional">
            <Input value={value.cta_label} onChange={(e) => set("cta_label", e.target.value)} placeholder="Choose Pro" />
          </Field>
          <Field label="Description" optionalLabel="Optional" className="sm:col-span-2">
            <Textarea rows={2} value={value.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Price note" hint="Small text under the price." optionalLabel="Optional">
            <Input value={value.price_note} onChange={(e) => set("price_note", e.target.value)} />
          </Field>
          <Field label="Fine print" hint="Shown under all cards." optionalLabel="Optional">
            <Input value={value.fine_print} onChange={(e) => set("fine_print", e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Switch checked={value.is_featured} onCheckedChange={(v) => set("is_featured", v)} label="Highlight (featured)" />
          <Switch checked={value.is_active} onCheckedChange={(v) => set("is_active", v)} label="Can be ordered" />
          <Switch checked={value.is_visible} onCheckedChange={(v) => set("is_visible", v)} label="Shown on the website" />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 type-label text-ink">What’s included</legend>
          <SortableList
            items={value.features}
            getId={(f) => f.id}
            getLabel={(f) => f.label || "feature"}
            onReorder={(ids) => set("features", ids.map((i) => value.features.find((f) => f.id === i)!))}
            renderItem={(f, handle) => (
              <div className="flex items-center gap-2">
                {handle}
                <input
                  aria-label="Feature"
                  id={`${id}-${f.id}`}
                  value={f.label}
                  onChange={(e) => set("features", value.features.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))}
                  placeholder="Up to 1,000 customer chats a month"
                  className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring"
                />
                <Checkbox
                  aria-label="Included"
                  label="Included"
                  checked={f.included}
                  onChange={(e) => set("features", value.features.map((x) => (x.id === f.id ? { ...x, included: e.target.checked } : x)))}
                />
                <button
                  type="button"
                  onClick={() => set("features", value.features.filter((x) => x.id !== f.id))}
                  className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunk hover:text-danger focus-visible:focus-ring"
                >
                  <Trash2 aria-hidden size={14} strokeWidth={1.5} />
                  <span className="sr-only">Remove feature</span>
                </button>
              </div>
            )}
          />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            icon={<Plus aria-hidden size={14} strokeWidth={1.5} />}
            onClick={() => set("features", [...value.features, { id: newFeatureId(), label: "", included: true }])}
          >
            Add feature
          </Button>
        </fieldset>
      </div>
      <div className="flex flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
        <div className="flex items-center justify-between">
          <span className="type-label text-ink-muted">Website preview</span>
          <div className="flex gap-1 rounded-full bg-surface-sunk p-1" role="group" aria-label="Preview billing">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={`h-7 rounded-full px-3 type-label ${cycle === c ? "bg-surface-raised text-brand shadow-soft" : "text-ink-muted"}`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-3">
          <PricingCard pkg={preview} cycle={cycle} as="div" />
        </div>
      </div>
    </div>
  );
}
