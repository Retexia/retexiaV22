"use client";

import { Button, Card, CheckboxGroup, Dialog, Field, Input } from "@retexia/ui";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteGroup, saveGroup } from "@/app/post/actions";

type Group = { id?: string; name: string; product_ids: string[] };

/** Groups of products (e.g. "Cakes"): a post can be about a whole group. */
export function GroupsEditor({ groups, products }: { groups: Group[]; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Group | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const open = (g?: Group) => {
    setErrors({});
    setEdit(g ? { ...g } : { name: "", product_ids: [] });
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="groups-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="groups-title" className="type-h2 text-ink">
            Groups
          </h2>
          <p className="type-small text-ink-muted">Put products together (e.g. &ldquo;Cakes&rdquo;, &ldquo;Party packs&rdquo;) to make a post about the whole group.</p>
        </div>
        <Button variant="secondary" disabled={!products.length} icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => open()}>
          New group
        </Button>
      </div>
      {groups.length ? (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <Layers aria-hidden size={18} strokeWidth={1.5} className="text-ink-muted" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="type-label text-ink">{g.name}</span>
                  <span className="truncate type-small text-ink-muted">
                    {g.product_ids.map((id) => names.get(id)).filter(Boolean).join(", ") || "No products"}
                  </span>
                </div>
                <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => open(g)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    if (!window.confirm(`Delete the group ${g.name}? The products stay.`)) return;
                    const r = await deleteGroup({ id: g.id! });
                    toast[r.ok ? "success" : "error"](r.message ?? "");
                    router.refresh();
                  }}
                >
                  <span className="sr-only">Delete {g.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="type-body text-ink-muted">{products.length ? "No groups yet." : "Add products first, then group them."}</p>
        </Card>
      )}
      <Dialog
        open={Boolean(edit)}
        onOpenChange={(o) => !o && setEdit(null)}
        size="lg"
        title={edit?.id ? `Edit ${edit.name}` : "New group"}
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
                const r = await saveGroup({ id: edit.id, name: edit.name, product_ids: edit.product_ids });
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
            <Field label="Group name" error={errors.name} required>
              <Input autoFocus value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Cakes" />
            </Field>
            <Field label="Products in this group" labelAs="legend" error={errors.product_ids}>
              <CheckboxGroup name="group-products" columns={2} value={edit.product_ids} onChange={(product_ids) => setEdit({ ...edit, product_ids })} options={products.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
