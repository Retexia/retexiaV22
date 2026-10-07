"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Switch, Textarea } from "@retexia/ui";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteProduct, saveProduct } from "@/app/post/actions";

type P = { id?: string; name: string; price: number | null; currency: string; description: string; active: boolean; photos?: number };

export function ProductsEditor({ products, currency }: { products: P[]; currency: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<(P & { priceText: string }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const open = (p?: P) => {
    setErrors({});
    setEdit(p ? { ...p, priceText: p.price == null ? "" : String(p.price) } : { name: "", price: null, currency, description: "", active: true, priceText: "" });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => open()}>
          Add product
        </Button>
      </div>
      {products.length ? (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="type-label text-ink">{p.name}</span>
                    {p.price != null ? (
                      <span className="type-small text-ink-muted">
                        {p.currency} {Number(p.price).toLocaleString("en-US")}
                      </span>
                    ) : null}
                    {!p.active ? <Badge tone="neutral">Not promoted</Badge> : null}
                  </span>
                  {p.description ? <span className="truncate type-small text-ink-muted">{p.description}</span> : null}
                </div>
                <Link href={`/library?product=${p.id}`} className="type-small text-link">
                  {p.photos ? `${p.photos} photo${p.photos === 1 ? "" : "s"}` : "Add photos"}
                </Link>
                <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => open(p)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    if (!window.confirm(`Delete ${p.name}? Its photos stay in your library.`)) return;
                    const r = await deleteProduct({ id: p.id! });
                    toast[r.ok ? "success" : "error"](r.message ?? "");
                    router.refresh();
                  }}
                >
                  <span className="sr-only">Delete {p.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="No products yet" icon={<Package aria-hidden size={24} strokeWidth={1.5} />}>
          Add what you sell, with prices. Posts only use prices you enter here or in an offer.
        </EmptyState>
      )}
      <Dialog
        open={Boolean(edit)}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? `Edit ${edit.name}` : "New product"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!edit) return;
                setBusy(true);
                const r = await saveProduct({
                  id: edit.id,
                  name: edit.name,
                  price: edit.priceText.trim() === "" ? null : Number(edit.priceText.replace(/,/g, "")),
                  currency: edit.currency,
                  description: edit.description,
                  active: edit.active,
                });
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
          </>
        }
      >
        {edit ? (
          <div className="flex flex-col gap-4">
            <Field label="Name" error={errors.name} required>
              <Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Field label="Price" hint="Leave empty if it varies." error={errors.price} optionalLabel="Optional">
                <Input inputMode="decimal" value={edit.priceText} onChange={(e) => setEdit({ ...edit, priceText: e.target.value })} />
              </Field>
              <Field label="Currency" error={errors.currency}>
                <Input value={edit.currency} maxLength={3} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <Field label="Short description" hint="What makes it good, sizes, flavours…" optionalLabel="Optional">
              <Textarea rows={3} value={edit.description} maxLength={1000} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Switch checked={edit.active} onCheckedChange={(active) => setEdit({ ...edit, active })} label="Promote this product" description="Off = the AI leaves it out of new posts." />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
