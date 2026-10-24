"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input } from "@retexia/ui";
import { Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { removeMyProduct, saveMyProduct } from "@/app/feeder/actions";

export type CatalogItem = { product_id: number; product_name: string; price: number; delivery_fee: number };
export type MyItem = CatalogItem & { form_names: string[]; my_price: number | null };

const money = (n: number) => `LKR ${n.toLocaleString("en-US")}`;

/** Chips for form names: type a name and press Enter (or comma). */
function FormNames({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...value, ...parts.filter((p) => !value.some((v) => v.toLowerCase() === p.toLowerCase()))].slice(0, 30));
    setDraft("");
  };
  return (
    <Field
      label="Your form names for this product"
      hint="Exactly as the form is named in Facebook / TikTok Leads Center, or the product name used in your CRM sheet. Add as many as you use; press Enter after each."
      error={error}
      optionalLabel="Optional"
    >
      <div className="flex flex-col gap-2">
        {value.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {value.map((n) => (
              <li key={n} className="flex items-center gap-1 rounded-full border border-line bg-surface-sunk py-0.5 pl-3 pr-1 type-small text-ink">
                {n}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== n))} className="rounded-full p-0.5 text-ink-muted hover:text-ink focus-visible:focus-ring">
                  <X aria-hidden size={12} strokeWidth={2} />
                  <span className="sr-only">Remove {n}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder="e.g. Diabetic Care 1340 - Copy"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            className="min-w-0 flex-1"
          />
          <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      </div>
    </Field>
  );
}

/** Search box + list: pick one Feeder product (by name or ID). */
function ProductSearch({ catalog, taken, onPick }: { catalog: CatalogItem[]; taken: Set<number>; onPick: (p: CatalogItem) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalog.filter((p) => !taken.has(p.product_id) && (!t || p.product_name.toLowerCase().includes(t) || String(p.product_id) === t || String(p.product_id).startsWith(t))).slice(0, 60);
  }, [q, catalog, taken]);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search aria-hidden size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input autoFocus aria-label="Search Feeder products" placeholder="Search by name or product ID…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <ul role="listbox" aria-label="Feeder products" className="max-h-72 overflow-y-auto rounded-md border border-line">
        {list.length ? (
          list.map((p) => (
            <li key={p.product_id} role="option" aria-selected={false}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-sunk focus-visible:focus-ring">
                <span className="w-12 shrink-0 type-code text-ink-muted">{p.product_id}</span>
                <span className="min-w-0 flex-1 truncate type-body text-ink">{p.product_name}</span>
                <span className="type-small text-ink-muted">{money(p.price)}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-6 text-center type-small text-ink-muted">{q ? "No product with that name or ID." : "All products are already added."}</li>
        )}
      </ul>
    </div>
  );
}

type Edit = { product: CatalogItem; form_names: string[]; price: string; isNew: boolean };

/**
 * The customer's Feeder products: each with their form names (so every lead
 * from that form becomes this product in the courier file) and, optionally,
 * their own selling price. Saved to their account.
 */
export function MyProducts({ catalog, mine }: { catalog: CatalogItem[]; mine: MyItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const taken = useMemo(() => new Set(mine.map((m) => m.product_id)), [mine]);

  const start = (m?: MyItem) => {
    setErrors({});
    setEdit(m ? { product: m, form_names: m.form_names, price: m.my_price == null ? "" : String(m.my_price), isNew: false } : null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setEdit(null);
  };

  async function save() {
    if (!edit) return;
    setBusy(true);
    const price = edit.price.trim() === "" ? null : Number(edit.price.replace(/,/g, ""));
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setBusy(false);
      return setErrors({ price: "Enter a price in LKR, or leave it empty" });
    }
    const r = await saveMyProduct({ product_id: edit.product.product_id, form_names: edit.form_names, price });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    close();
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="type-h3 text-ink">My products</h2>
          <p className="type-body text-ink-muted">Add the Feeder products you sell and the names of your lead forms for each. Then every lead lands on the right product, item code and price.</p>
        </div>
        <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => start()}>
          Add product
        </Button>
      </div>

      {mine.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {mine.map((m) => (
            <li key={m.product_id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="type-code text-ink-muted">{m.product_id}</span>
                  <span className="type-label text-ink">{m.product_name}</span>
                  <span className="type-small text-ink-muted">
                    {money(m.my_price ?? m.price)}
                    {m.my_price != null && m.my_price !== m.price ? " (your price)" : ""} · delivery {money(m.delivery_fee)}
                  </span>
                </span>
                {m.form_names.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {m.form_names.map((n) => (
                      <Badge key={n} tone="neutral">
                        {n}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="type-small text-warning">No form names yet: add the names of your forms for this product.</span>
                )}
              </div>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => start(m)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    if (!window.confirm(`Remove ${m.product_name} and its form names?`)) return;
                    const r = await removeMyProduct({ product_id: m.product_id });
                    toast[r.ok ? "success" : "error"](r.message ?? "");
                    router.refresh();
                  }}
                >
                  <span className="sr-only">Remove {m.product_name}</span>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No products yet" icon={<Package aria-hidden size={24} strokeWidth={1.5} />}>
          Press <strong>Add product</strong>, search for a product you sell, and type the names of your lead forms for it.
        </EmptyState>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => !o && !busy && close()}
        size="lg"
        title={edit ? (edit.isNew ? "Add product" : `Edit ${edit.product.product_name}`) : "Add product"}
        description={edit ? undefined : "Search the Feeder product list, then pick the product."}
        footer={
          edit ? (
            <>
              {edit.isNew ? (
                <Button variant="ghost" disabled={busy} onClick={() => setEdit(null)}>
                  Back
                </Button>
              ) : (
                <Button variant="ghost" disabled={busy} onClick={close}>
                  Cancel
                </Button>
              )}
              <Button loading={busy} onClick={save}>
                Save
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          )
        }
      >
        {edit ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-sunk px-3 py-2">
              <span className="type-code text-ink-muted">{edit.product.product_id}</span>
              <span className="type-label text-ink">{edit.product.product_name}</span>
              <span className="type-small text-ink-muted">
                Feeder price {money(edit.product.price)} · delivery {money(edit.product.delivery_fee)}
              </span>
            </div>
            <FormNames value={edit.form_names} onChange={(form_names) => setEdit({ ...edit, form_names })} error={errors.form_names} />
            <Field label="Your selling price (LKR)" hint={`The price your customers pay (COD). Leave empty to use Feeder's ${money(edit.product.price)}.`} error={errors.price} optionalLabel="Optional" className="max-w-xs">
              <Input inputMode="decimal" value={edit.price} placeholder={String(edit.product.price)} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
            </Field>
          </div>
        ) : (
          <ProductSearch catalog={catalog} taken={taken} onPick={(p) => setEdit({ product: p, form_names: [], price: "", isNew: true })} />
        )}
      </Dialog>
    </Card>
  );
}
