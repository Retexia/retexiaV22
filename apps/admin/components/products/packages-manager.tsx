"use client";

import { Badge, Button, Card, formatPrice } from "@retexia/ui";
import { ConfirmDialog, SortableList, useUnsavedChanges } from "@retexia/ui/admin";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, reorder, savePackage } from "@/app/(panel)/products/actions";
import { PackageEditor, emptyPackage, packagePayload, type PackageDraft } from "./package-editor";

export type PackageRow = PackageDraft & { id: string; orders: number };

export function PackagesManager({ productId, packages, currency }: { productId: string; packages: PackageRow[]; currency: string }) {
  const router = useRouter();
  const [items, setItems] = useState(packages);
  const [editing, setEditing] = useState<{ id?: string; draft: PackageDraft; orders: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<PackageRow | null>(null);
  const original = editing?.id ? packages.find((p) => p.id === editing.id) : null;
  useUnsavedChanges(Boolean(editing) && JSON.stringify(editing?.draft) !== JSON.stringify(original ? stripRow(original) : emptyPackage()));

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim() || d.price_monthly === "") return toast.error("Add a name and a monthly price.");
    setBusy(true);
    const r = await savePackage({ id: editing.id, productId, pkg: packagePayload(d), is_active: d.is_active, is_visible: d.is_visible, price_note: d.price_note });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Saved");
    setEditing(null);
    router.refresh();
  };

  if (editing) {
    return (
      <Card className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-h2 text-ink">{editing.id ? `Edit ${original?.name ?? "package"}` : "New package"}</h2>
          {editing.orders ? <Badge tone="neutral">{editing.orders} request{editing.orders === 1 ? "" : "s"} use this package</Badge> : null}
        </div>
        <PackageEditor value={editing.draft} currency={currency} slugLocked={editing.orders > 0} onChange={(draft) => setEditing({ ...editing, draft })} />
        <p className="type-small text-ink-muted">Price changes apply to new requests. Existing requests keep the price they were ordered at.</p>
        <div className="flex gap-2">
          <Button loading={busy} onClick={save}>
            Save package
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="type-body text-ink-muted">{items.length ? "Drag to change the order on the pricing table." : "No packages yet. The product page shows a waitlist until you add one."}</p>
        <Button size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEditing({ draft: emptyPackage(), orders: 0 })}>
          Add package
        </Button>
      </div>
      <SortableList
        items={items}
        getId={(p) => p.id}
        getLabel={(p) => p.name}
        className="flex flex-col gap-3"
        onReorder={async (ids) => {
          setItems(ids.map((i) => items.find((p) => p.id === i)!));
          const r = await reorder({ table: "packages", ids });
          toast[r.ok ? "success" : "error"](r.message ?? "");
        }}
        renderItem={(p, handle) => (
          <Card className="flex flex-wrap items-center gap-4">
            {handle}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-h3 text-ink">{p.name}</span>
                <span className="type-code text-ink-muted">{p.slug}</span>
                {p.badge ? <Badge tone="brand">{p.badge}</Badge> : null}
                {!p.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
                {!p.is_active ? <Badge tone="warning">Not orderable</Badge> : null}
              </span>
              <span className="type-small text-ink-muted">
                {formatPrice(Number(p.price_monthly), p.currency || currency)} / month
                {p.price_yearly !== "" ? ` · ${formatPrice(Number(p.price_yearly), p.currency || currency)} / year` : ""}
                {Number(p.setup_fee) > 0 ? ` · ${formatPrice(Number(p.setup_fee), p.currency || currency)} setup` : ""} · {p.features.length} features · {p.orders} requests
              </span>
            </div>
            <Button size="sm" variant="secondary" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEditing({ id: p.id, draft: stripRow(p), orders: p.orders })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(p)}>
              <span className="sr-only">Delete {p.name}</span>
            </Button>
          </Card>
        )}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete ${remove?.name}?`}
        description={remove?.orders ? "Requests use this package, so it can't be deleted. Turn off “Shown on the website” and “Can be ordered” instead." : "It disappears from the pricing table straight away."}
        confirmLabel="Delete package"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteRow({ table: "packages", id: remove.id });
          toast[r.ok ? "success" : "error"](r.ok ? "Package deleted" : r.message);
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

function stripRow({ id: _id, orders: _orders, ...draft }: PackageRow): PackageDraft {
  return draft;
}
