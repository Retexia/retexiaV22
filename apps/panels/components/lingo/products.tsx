"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Switch, Textarea } from "@retexia/ui";
import { ImageOff, Package, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteProduct, saveProduct, uploadProductPhoto } from "@/app/lingo/actions";
import type { LingoProductRow } from "@/lib/lingo/db.types";
import { money } from "@/lib/lingo/labels";
import { preparePhoto } from "@/lib/resize";

type Row = LingoProductRow & { sold30: number };
type Draft = {
  id?: number;
  product_name: string;
  short_description: string;
  long_description: string;
  price: string;
  delivery_fee: string;
  ingredients: string;
  application: string;
  precautions: string;
  symptoms: string;
  aliases: string;
  word_description: string;
  picture_url: string;
  active: boolean;
};

const toDraft = (p?: Row): Draft => ({
  id: p?.id,
  product_name: p?.product_name ?? "",
  short_description: p?.short_description ?? "",
  long_description: p?.long_description ?? "",
  price: p ? String(p.price) : "",
  delivery_fee: p?.delivery_fee == null ? "" : String(p.delivery_fee),
  ingredients: p?.ingredients ?? "",
  application: p?.application ?? "",
  precautions: p?.precautions ?? "",
  symptoms: p?.symptoms ?? "",
  aliases: p?.aliases ?? "",
  word_description: p?.word_description ?? "",
  picture_url: p?.picture_url ?? "",
  active: p?.active ?? true,
});

export function LingoProducts({ products, defaultFee }: { products: Row[]; defaultFee: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = products.filter((p) => !q || `${p.product_name} ${p.aliases ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const field = (k: keyof Draft, label: string, opts: { rows?: number; hint?: string; wide?: boolean } = {}) =>
    edit ? (
      <Field label={label} hint={opts.hint} error={errors[k]} optionalLabel="Optional" className={opts.wide ? "sm:col-span-2" : undefined}>
        {opts.rows ? <Textarea rows={opts.rows} value={String(edit[k] ?? "")} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /> : <Input value={String(edit[k] ?? "")} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}
      </Field>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" placeholder="Search products" className="h-9 w-56 rounded-full border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring" />
        <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => (setErrors({}), setEdit(toDraft()))}>
          Add product
        </Button>
      </div>
      {shown.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Card padded={false} className="flex h-full overflow-hidden">
                <span className="flex w-24 shrink-0 items-center justify-center bg-surface-sunk">
                  {/* eslint-disable-next-line @next/next/no-img-element -- product photo URL */}
                  {p.picture_url ? <img src={p.picture_url} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff aria-hidden size={20} strokeWidth={1.5} className="text-ink-muted" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate type-label text-ink">{p.product_name}</span>
                    {!p.active ? <Badge tone="neutral">Hidden</Badge> : null}
                  </span>
                  <span className="type-small text-ink">{money(p.price)}</span>
                  <span className="line-clamp-2 type-caption text-ink-muted">{p.short_description || "No description yet"}</span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="type-caption text-ink-muted">{p.sold30 ? `${p.sold30} sold in 30 days` : ""}</span>
                    <span className="flex">
                      <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => (setErrors({}), setEdit(toDraft(p)))}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                        onClick={async () => {
                          if (!window.confirm(`Delete ${p.product_name}?`)) return;
                          const r = await deleteProduct({ id: p.id });
                          toast[r.ok ? "success" : "error"](r.message ?? "");
                          router.refresh();
                        }}
                      >
                        <span className="sr-only">Delete</span>
                      </Button>
                    </span>
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={products.length ? "Nothing matches" : "No products yet"} icon={<Package aria-hidden size={24} strokeWidth={1.5} />}>
          Add what you sell. Lingo answers price and product questions from this list.
        </EmptyState>
      )}

      <Dialog
        open={Boolean(edit)}
        onOpenChange={(o) => !o && setEdit(null)}
        size="lg"
        title={edit?.id ? `Edit ${edit.product_name}` : "New product"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              loading={busy === "save"}
              onClick={async () => {
                if (!edit) return;
                setBusy("save");
                const r = await saveProduct({
                  ...edit,
                  price: Number(edit.price.replace(/,/g, "")) || 0,
                  delivery_fee: edit.delivery_fee.trim() === "" ? null : Number(edit.delivery_fee) || 0,
                });
                setBusy(null);
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  return toast.error(r.message);
                }
                toast.success(r.message ?? "Saved");
                setEdit(null);
                router.refresh();
              }}
            >
              Save product
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.product_name} required className="sm:col-span-2">
              <Input autoFocus value={edit.product_name} onChange={(e) => setEdit({ ...edit, product_name: e.target.value })} />
            </Field>
            <Field label="Price (Rs.)" error={errors.price} required>
              <Input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
            </Field>
            <Field label="Delivery charge (Rs.)" hint={`Empty = your usual ${money(defaultFee)}`} optionalLabel="Optional">
              <Input inputMode="decimal" value={edit.delivery_fee} onChange={(e) => setEdit({ ...edit, delivery_fee: e.target.value })} />
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="type-label text-ink">Photo</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-20 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-sunk">
                  {/* eslint-disable-next-line @next/next/no-img-element -- product photo URL */}
                  {edit.picture_url ? <img src={edit.picture_url} alt="" className="size-full object-cover" /> : <ImageOff aria-hidden size={18} strokeWidth={1.5} className="text-ink-muted" />}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setBusy("photo");
                    try {
                      const p = await preparePhoto(f);
                      const fd = new FormData();
                      fd.set("file", p.file);
                      const r = await uploadProductPhoto(fd);
                      if (r.ok && r.data) setEdit((d) => (d ? { ...d, picture_url: r.data!.url } : d));
                      else toast.error(r.ok ? "Upload failed" : r.message);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Upload failed");
                    }
                    setBusy(null);
                  }}
                />
                <Button size="sm" variant="secondary" loading={busy === "photo"} icon={<Upload aria-hidden size={14} strokeWidth={1.5} />} onClick={() => fileRef.current?.click()}>
                  {edit.picture_url ? "Change photo" : "Upload photo"}
                </Button>
                {edit.picture_url ? (
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, picture_url: "" })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            {field("short_description", "Short description", { rows: 2, wide: true, hint: "One or two lines for lists and quick answers." })}
            {field("long_description", "Full description", { rows: 4, wide: true, hint: "Sent the first time a customer asks about this product." })}
            {field("symptoms", "What it's for / who it suits", { rows: 2, wide: true, hint: "Helps Lingo recommend it (e.g. hair fall, dry skin)." })}
            {field("aliases", "Other names customers use", { hint: "Separated by commas, in any language." })}
            {field("word_description", "Keywords", { hint: "Words that should find this product." })}
            {field("ingredients", "Ingredients", { rows: 2 })}
            {field("application", "How to use", { rows: 2 })}
            {field("precautions", "Precautions", { rows: 2, wide: true })}
            <div className="sm:col-span-2">
              <Switch checked={edit.active} onCheckedChange={(active) => setEdit({ ...edit, active })} label="Available" description="Off = Lingo doesn't offer it (orders stay)." />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
