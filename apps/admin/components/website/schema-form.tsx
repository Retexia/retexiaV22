"use client";

import { Button, Field, Input, Select, Switch, Textarea, cn } from "@retexia/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { IconPicker } from "@/components/products/icon-picker";
import { MediaInput } from "./media-picker";

/** The subset of JSON Schema that z.toJSONSchema produces for section content. */
export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
  anyOf?: JsonSchema[];
  const?: string | number | boolean;
  default?: unknown;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
};

type Ctx = { products: { slug: string; name: string }[]; errors: Record<string, string> };
const SchemaCtx = createContext<Ctx>({ products: [], errors: {} });

const LABELS: Record<string, string> = {
  primary_cta: "Main button",
  secondary_cta: "Second button",
  cta: "Button",
  label: "Text",
  href: "Link",
  visual: "Visual",
  image_url: "Image",
  image_alt: "Image description (for screen readers)",
  image_side: "Image side",
  show_halo: "Soft glow behind the headline",
  badge: "Small badge",
  size: "Size",
  chat: "Chat example",
  name: "Name",
  status: "Status line",
  messages: "Messages",
  from: "From",
  text: "Text",
  time: "Time",
  source: "Where the features come from",
  product_slug: "Product",
  items: "Items",
  title: "Title",
  icon: "Icon",
  columns: "Columns",
  include_coming_soon: "Include “coming soon” products",
  show_status: "Show product status",
  layout: "Layout",
  body: "Text",
  stats: "Numbers",
  value: "Value",
  show_yearly_toggle: "Show the monthly / yearly switch",
  note: "Note under the prices",
  show_form: "Show the contact form",
  show_details: "Show email, phone and address",
  show_whatsapp: "Show the WhatsApp button",
};
const ENUM_LABELS: Record<string, string> = {
  lingo_chat: "Lingo chat demo",
  chat: "Chat (written below)",
  image: "Image",
  none: "None",
  large: "Large",
  small: "Compact",
  product: "From the product (Details tab)",
  inline: "Written here",
  customer: "Customer",
  business: "Business",
  left: "Left",
  right: "Right",
  grid: "Grid",
};
const human = (key: string) => LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function emptyFor(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "object") {
    const out: Record<string, unknown> = {};
    for (const k of schema.required ?? []) out[k] = emptyFor(schema.properties?.[k] ?? {});
    return out;
  }
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf?.[0]?.const !== undefined) return schema.anyOf[0].const;
  return "";
}

/** Form generated from a section's JSON schema, with friendly widgets for known keys. */
export function SchemaForm({
  schema,
  value,
  onChange,
  products,
  errors = {},
}: {
  schema: JsonSchema;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  products: { slug: string; name: string }[];
  errors?: Record<string, string>;
}) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) return null;
  return (
    <SchemaCtx.Provider value={{ products, errors }}>
      <ObjectFields schema={schema} value={value} onChange={onChange} path="content" />
    </SchemaCtx.Provider>
  );
}

function ObjectFields({ schema, value, onChange, path }: { schema: JsonSchema; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; path: string }) {
  const entries = Object.entries(schema.properties ?? {});
  // Hide chat settings unless the hero visual is "chat"; image fields unless "image".
  const visible = entries.filter(([k]) => {
    if ("visual" in (schema.properties ?? {})) {
      if (k === "chat") return value.visual === "chat";
      if (k === "image_url" || k === "image_alt") return value.visual === "image";
    }
    if (k === "items" && "source" in (schema.properties ?? {})) return value.source !== "product";
    if (k === "product_slug" && "source" in (schema.properties ?? {})) return value.source === "product";
    return true;
  });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map(([key, child]) => (
        <Node
          key={key}
          name={key}
          schema={child}
          required={(schema.required ?? []).includes(key)}
          value={value[key]}
          path={`${path}.${key}`}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) delete next[key];
            else next[key] = v;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function Node({ name, schema, required, value, onChange, path }: { name: string; schema: JsonSchema; required: boolean; value: unknown; onChange: (v: unknown) => void; path: string }) {
  const { products, errors } = useContext(SchemaCtx);
  const error = errors[path.replace(/^content\./, "content.")] ?? null;
  const label = human(name);
  const opt = required || schema.default !== undefined ? undefined : "Optional";

  if (schema.type === "object") {
    const present = value !== undefined && value !== null;
    return (
      <fieldset className="flex flex-col gap-3 rounded-md border border-line p-4 sm:col-span-2">
        <legend className="px-1 type-label text-ink">{label}</legend>
        {!required ? <Switch checked={present} onCheckedChange={(on) => onChange(on ? emptyFor(schema) : undefined)} label={`Show ${label.toLowerCase()}`} /> : null}
        {present ? <ObjectFields schema={schema} value={value as Record<string, unknown>} onChange={onChange} path={path} /> : null}
      </fieldset>
    );
  }

  if (schema.type === "array" && schema.items) {
    const list = Array.isArray(value) ? value : [];
    const item = schema.items;
    const move = (i: number, d: number) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x);
      onChange(next);
    };
    return (
      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="mb-1 type-label text-ink">
          {label}
          {schema.minItems ? <span className="type-small text-ink-muted"> (at least {schema.minItems})</span> : null}
        </legend>
        {error ? <p className="type-small text-danger">{error}</p> : null}
        <ol className="flex flex-col gap-3">
          {list.map((entry, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunk/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="type-small text-ink-muted">
                  {i + 1}. {typeof entry === "object" && entry ? String(Object.values(entry as object).find((v) => typeof v === "string" && v) ?? "") : String(entry ?? "")}
                </span>
                <span className="flex">
                  <SmallButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden size={14} strokeWidth={1.5} />
                  </SmallButton>
                  <SmallButton label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown aria-hidden size={14} strokeWidth={1.5} />
                  </SmallButton>
                  <SmallButton label="Remove" disabled={Boolean(schema.minItems && list.length <= schema.minItems)} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                    <Trash2 aria-hidden size={14} strokeWidth={1.5} />
                  </SmallButton>
                </span>
              </div>
              {item.type === "object" ? (
                <ObjectFields schema={item} value={(entry ?? {}) as Record<string, unknown>} path={`${path}.${i}`} onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))} />
              ) : (
                <Node name={name} schema={item} required value={entry} path={`${path}.${i}`} onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))} />
              )}
            </li>
          ))}
        </ol>
        {!schema.maxItems || list.length < schema.maxItems ? (
          <Button size="sm" variant="ghost" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => onChange([...list, emptyFor(item)])}>
            Add
          </Button>
        ) : null}
      </fieldset>
    );
  }

  if (schema.type === "boolean") {
    return (
      <div className="flex items-end sm:col-span-2">
        <Switch checked={Boolean(value ?? schema.default)} onCheckedChange={onChange} label={label} />
      </div>
    );
  }

  const choices: { value: string; label: string }[] | null = schema.enum
    ? schema.enum.map((v) => ({ value: String(v), label: ENUM_LABELS[String(v)] ?? String(v) }))
    : schema.anyOf?.every((a) => a.const !== undefined)
      ? schema.anyOf.map((a) => ({ value: String(a.const), label: String(a.const) }))
      : null;
  if (choices) {
    const numeric = schema.anyOf?.some((a) => a.type === "number");
    return (
      <Field label={label} error={error} optionalLabel={opt}>
        <Select
          value={String(value ?? schema.default ?? "")}
          onChange={(e) => onChange(e.target.value === "" ? undefined : numeric ? Number(e.target.value) : e.target.value)}
          options={choices}
          placeholder={required ? "Choose one" : "Default"}
        />
      </Field>
    );
  }

  const str = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  const set = (v: string) => onChange(v === "" && !required ? undefined : v);

  if (name === "product_slug") {
    return (
      <Field label={label} error={error} hint="Empty = the page's own product." optionalLabel={opt}>
        <Select value={str} onChange={(e) => set(e.target.value)} options={products.map((p) => ({ value: p.slug, label: p.name }))} placeholder="This page's product" />
      </Field>
    );
  }
  if (name === "icon") return <IconPicker value={str} onChange={set} />;
  if (name.endsWith("_url")) {
    return (
      <Field label={label} error={error} optionalLabel={opt} className="sm:col-span-2">
        <MediaInput value={str} onChange={set} />
      </Field>
    );
  }
  if (name === "body") {
    return (
      <Field label={label} error={error} hint="Markdown: **bold**, lists, [links](https://…)." optionalLabel={opt} className="sm:col-span-2" labelAs="legend">
        <MarkdownEditor value={str} onChange={set} rows={8} />
      </Field>
    );
  }
  if (schema.type === "number" || schema.type === "integer") {
    return (
      <Field label={label} error={error} optionalLabel={opt}>
        <Input type="number" value={str} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
      </Field>
    );
  }
  const long = name === "text" || name === "note";
  return (
    <Field label={label} error={error} optionalLabel={opt} hint={name === "href" ? "/contact, #pricing or https://…" : undefined} className={cn(long && "sm:col-span-2")}>
      {long ? <Textarea rows={2} value={str} onChange={(e) => set(e.target.value)} /> : <Input value={str} onChange={(e) => set(e.target.value)} />}
    </Field>
  );
}

function SmallButton({ label, children, onClick, disabled }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
