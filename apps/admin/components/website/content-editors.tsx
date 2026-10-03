"use client";

import { Badge, Button, Card, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { ConfirmDialog, SortableList } from "@retexia/ui/admin";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteContent, reorderContent, saveNavItem, saveService, saveTestimonial } from "@/app/(panel)/website/actions";
import { IconPicker } from "@/components/products/icon-picker";
import { ProductIcon } from "@/components/products/product-icon";
import { MediaInput } from "./media-picker";

type Table = "services" | "testimonials" | "navigation_items";
type ActionResultLike = { ok: true; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Sortable list with inline add/edit and delete, shared by the content editors. */
function RowsEditor<T extends { id?: string }>({
  table,
  rows,
  blank,
  addLabel,
  emptyText,
  summary,
  form,
  save,
  deleteText,
}: {
  table: Table;
  rows: (T & { id: string })[];
  blank: () => T;
  addLabel: string;
  emptyText: string;
  summary: (row: T & { id: string }) => ReactNode;
  form: (value: T, set: (v: T) => void, errors: Record<string, string>) => ReactNode;
  save: (value: T) => Promise<ActionResultLike>;
  deleteText: (row: T & { id: string }) => string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [edit, setEdit] = useState<T | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<(T & { id: string }) | null>(null);

  const editor = edit ? (
    <Card className="flex flex-col gap-4 border-brand/40!">
      {form(edit, setEdit, errors)}
      <div className="flex gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await save(edit);
            setBusy(false);
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              return toast.error(r.message);
            }
            toast.success(r.message ?? "Saved");
            setEdit(null);
            router.refresh();
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>
          Cancel
        </Button>
      </div>
    </Card>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          icon={<Plus aria-hidden size={16} strokeWidth={1.5} />}
          onClick={() => {
            setEdit(blank());
            setErrors({});
          }}
        >
          {addLabel}
        </Button>
      </div>
      {edit && !edit.id ? editor : null}
      {items.length ? (
        <SortableList
          items={items}
          getId={(r) => r.id}
          getLabel={(r) => String((r as Record<string, unknown>).label ?? (r as Record<string, unknown>).title ?? (r as Record<string, unknown>).author_name ?? "item")}
          className="flex flex-col gap-2"
          onReorder={async (ids) => {
            setItems(ids.map((i) => items.find((r) => r.id === i)!));
            const r = await reorderContent({ table, ids });
            toast[r.ok ? "success" : "error"](r.message ?? "");
          }}
          renderItem={(row, handle) =>
            edit?.id === row.id ? (
              editor
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-line bg-surface-raised px-3 py-2.5">
                {handle}
                <div className="min-w-0 flex-1">{summary(row)}</div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={() => {
                    setEdit(row);
                    setErrors({});
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(row)}>
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            )
          }
        />
      ) : edit ? null : (
        <Card>
          <p className="type-body text-ink-muted">{emptyText}</p>
        </Card>
      )}
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Delete this?"
        description={remove ? deleteText(remove) : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteContent({ table, id: remove.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) {
            setItems(items.filter((i) => i.id !== remove.id));
            router.refresh();
          }
          setRemove(null);
        }}
      />
    </div>
  );
}

// --- Services -------------------------------------------------------------------

export type Service = { id?: string; title: string; description: string; icon: string; href: string; is_visible: boolean };

export function ServicesEditor({ rows }: { rows: (Service & { id: string })[] }) {
  return (
    <RowsEditor<Service>
      table="services"
      rows={rows}
      blank={() => ({ title: "", description: "", icon: "wrench", href: "/contact", is_visible: true })}
      addLabel="Add service"
      emptyText="No services yet."
      save={saveService}
      deleteText={(r) => `“${r.title}” is removed from the services section.`}
      summary={(r) => (
        <span className="flex items-center gap-3">
          <ProductIcon name={r.icon} className="shrink-0 text-ink-muted" />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 type-label text-ink">
              {r.title}
              {!r.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
            </span>
            <span className="truncate type-small text-ink-muted">{r.description}</span>
          </span>
        </span>
      )}
      form={(v, set, errors) => (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <IconPicker value={v.icon} onChange={(icon) => set({ ...v, icon })} />
          <Field label="Title" error={errors.title} required>
            <Input autoFocus value={v.title} onChange={(e) => set({ ...v, title: e.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2" optionalLabel="Optional">
            <Textarea rows={2} value={v.description} onChange={(e) => set({ ...v, description: e.target.value })} />
          </Field>
          <Field label="Link" hint="Where “Talk to us” goes, e.g. /contact?topic=website" error={errors.href} optionalLabel="Optional">
            <Input value={v.href} onChange={(e) => set({ ...v, href: e.target.value })} />
          </Field>
          <div className="flex items-end pb-2">
            <Switch checked={v.is_visible} onCheckedChange={(is_visible) => set({ ...v, is_visible })} label="Shown on the website" />
          </div>
        </div>
      )}
    />
  );
}

// --- Testimonials ---------------------------------------------------------------

export type Testimonial = { id?: string; quote: string; author_name: string; author_role: string; company: string; avatar_url: string; product_id: string | null; is_visible: boolean };

export function TestimonialsEditor({ rows, products }: { rows: (Testimonial & { id: string })[]; products: { id: string; name: string }[] }) {
  return (
    <RowsEditor<Testimonial>
      table="testimonials"
      rows={rows}
      blank={() => ({ quote: "", author_name: "", author_role: "", company: "", avatar_url: "", product_id: null, is_visible: true })}
      addLabel="Add testimonial"
      emptyText="No testimonials yet. Only add real quotes, with permission; the section stays hidden while there are none."
      save={saveTestimonial}
      deleteText={(r) => `The quote by ${r.author_name} is removed.`}
      summary={(r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate type-body text-ink">“{r.quote}”</span>
          <span className="flex items-center gap-2 type-small text-ink-muted">
            {r.author_name}
            {r.company ? `, ${r.company}` : ""}
            {r.product_id ? <Badge tone="brand">{products.find((p) => p.id === r.product_id)?.name ?? "Product"}</Badge> : null}
            {!r.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
          </span>
        </span>
      )}
      form={(v, set, errors) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quote" error={errors.quote} required className="sm:col-span-2">
            <Textarea autoFocus rows={3} value={v.quote} onChange={(e) => set({ ...v, quote: e.target.value })} />
          </Field>
          <Field label="Name" error={errors.author_name} required>
            <Input value={v.author_name} onChange={(e) => set({ ...v, author_name: e.target.value })} />
          </Field>
          <Field label="Role" optionalLabel="Optional">
            <Input value={v.author_role} onChange={(e) => set({ ...v, author_role: e.target.value })} placeholder="Owner" />
          </Field>
          <Field label="Business" optionalLabel="Optional">
            <Input value={v.company} onChange={(e) => set({ ...v, company: e.target.value })} />
          </Field>
          <Field label="Product" hint="Empty = shown everywhere." optionalLabel="Optional">
            <Select value={v.product_id ?? ""} onChange={(e) => set({ ...v, product_id: e.target.value || null })} options={products.map((p) => ({ value: p.id, label: p.name }))} placeholder="All products" />
          </Field>
          <Field label="Photo" optionalLabel="Optional" className="sm:col-span-2">
            <MediaInput value={v.avatar_url} onChange={(avatar_url) => set({ ...v, avatar_url })} />
          </Field>
          <Switch checked={v.is_visible} onCheckedChange={(is_visible) => set({ ...v, is_visible })} label="Shown on the website" />
        </div>
      )}
    />
  );
}

// --- Navigation -----------------------------------------------------------------

export type NavItemRow = {
  id?: string;
  location: "header" | "footer_products" | "footer_company" | "footer_legal";
  kind: "link" | "button" | "products_menu";
  label: string;
  href: string;
  signed_in_label: string;
  signed_in_href: string;
  open_in_new_tab: boolean;
  is_visible: boolean;
};

const KIND_LABELS = { link: "Link", button: "Button", products_menu: "Products menu" };

export function NavigationEditor({ location, rows }: { location: NavItemRow["location"]; rows: (NavItemRow & { id: string })[] }) {
  return (
    <RowsEditor<NavItemRow>
      table="navigation_items"
      rows={rows}
      blank={() => ({ location, kind: "link", label: "", href: "/", signed_in_label: "", signed_in_href: "", open_in_new_tab: false, is_visible: true })}
      addLabel="Add link"
      emptyText="Nothing here yet."
      save={saveNavItem}
      deleteText={(r) => `“${r.label}” is removed from the menu.`}
      summary={(r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-label text-ink">{r.label}</span>
          <span className="type-code text-ink-muted">{r.kind === "products_menu" ? "all visible products" : r.href}</span>
          {r.kind !== "link" ? <Badge tone="brand">{KIND_LABELS[r.kind]}</Badge> : null}
          {r.signed_in_label ? <Badge tone="neutral">Signed in: {r.signed_in_label}</Badge> : null}
          {!r.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
        </span>
      )}
      form={(v, set, errors) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Text" error={errors.label} required>
            <Input autoFocus value={v.label} onChange={(e) => set({ ...v, label: e.target.value })} />
          </Field>
          {location === "header" ? (
            <Field label="Kind">
              <Select value={v.kind} onChange={(e) => set({ ...v, kind: (e.target.value || "link") as NavItemRow["kind"] })} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
            </Field>
          ) : null}
          {v.kind !== "products_menu" ? (
            <Field label="Link" hint="/contact, /#pricing or https://…" error={errors.href} required>
              <Input value={v.href} onChange={(e) => set({ ...v, href: e.target.value })} />
            </Field>
          ) : null}
          {v.kind === "button" ? (
            <>
              <Field label="Text when signed in" hint="E.g. “My account”." optionalLabel="Optional">
                <Input value={v.signed_in_label} onChange={(e) => set({ ...v, signed_in_label: e.target.value })} />
              </Field>
              <Field label="Link when signed in" error={errors.signed_in_href} optionalLabel="Optional">
                <Input value={v.signed_in_href} onChange={(e) => set({ ...v, signed_in_href: e.target.value })} placeholder="/account" />
              </Field>
            </>
          ) : null}
          <div className="flex flex-wrap gap-6 sm:col-span-2">
            <Switch checked={v.open_in_new_tab} onCheckedChange={(open_in_new_tab) => set({ ...v, open_in_new_tab })} label="Open in a new tab" />
            <Switch checked={v.is_visible} onCheckedChange={(is_visible) => set({ ...v, is_visible })} label="Shown" />
          </div>
        </div>
      )}
    />
  );
}
