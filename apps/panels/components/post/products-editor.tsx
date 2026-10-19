"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Switch, Textarea } from "@retexia/ui";
import { ImagePlus, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteProduct, removeProductPhoto, saveProduct, uploadMedia } from "@/app/post/actions";
import { MAX_PRODUCT_PHOTOS } from "@/lib/post/plans";
import { preparePhoto, preparedForm, type PreparedPhoto } from "@/lib/resize";

type Photo = { id: string; url: string | null };
type P = { id?: string; name: string; price: number | null; currency: string; description: string; active: boolean; photos?: Photo[] };
type NewPhoto = { key: string; photo: PreparedPhoto; url: string };
type Edit = P & { priceText: string; photos: Photo[]; removed: string[]; added: NewPhoto[] };

export function ProductsEditor({ products, currency }: { products: P[]; currency: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = (p?: P) => {
    setErrors({});
    setEdit(
      p
        ? { ...p, priceText: p.price == null ? "" : String(p.price), photos: p.photos ?? [], removed: [], added: [] }
        : { name: "", price: null, currency, description: "", active: true, priceText: "", photos: [], removed: [], added: [] },
    );
  };
  const close = () => {
    edit?.added.forEach((a) => URL.revokeObjectURL(a.url));
    setEdit(null);
  };
  const photoCount = edit ? edit.photos.length + edit.added.length : 0;

  async function pick(files: File[]) {
    if (!edit) return;
    const room = MAX_PRODUCT_PHOTOS - photoCount;
    if (files.length > room) toast.info(`A product can have up to ${MAX_PRODUCT_PHOTOS} photos${room ? `, so only the first ${room} were added` : ""}.`);
    setPreparing(true);
    const added: NewPhoto[] = [];
    for (const f of files.slice(0, room)) {
      try {
        const photo = await preparePhoto(f);
        added.push({ key: crypto.randomUUID(), photo, url: URL.createObjectURL(photo.thumb) });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not read ${f.name}`);
      }
    }
    setPreparing(false);
    setEdit((cur) => (cur ? { ...cur, added: [...cur.added, ...added] } : cur));
  }

  async function save() {
    if (!edit) return;
    setBusy("Saving…");
    const r = await saveProduct({
      id: edit.id,
      name: edit.name,
      price: edit.priceText.trim() === "" ? null : Number(edit.priceText.replace(/,/g, "")),
      currency: edit.currency,
      description: edit.description,
      active: edit.active,
    });
    if (!r.ok || !r.data) {
      setBusy(null);
      setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
      return toast.error(r.ok ? "Something went wrong. Please try again." : r.message);
    }
    const productId = r.data.id;
    const problems: string[] = [];
    // Removals first, so there is room for the new photos.
    for (const id of edit.removed) {
      const x = await removeProductPhoto({ id });
      if (!x.ok) problems.push(x.message);
    }
    for (const [i, a] of edit.added.entries()) {
      setBusy(`Uploading photo ${i + 1} of ${edit.added.length}…`);
      const x = await uploadMedia(preparedForm(a.photo, { product_id: productId }));
      if (!x.ok) problems.push(x.message);
    }
    setBusy(null);
    if (problems.length) toast.error(`${r.message} but some photos were not saved: ${[...new Set(problems)].join(" ")}`);
    else toast.success(r.message ?? "Saved");
    close();
    router.refresh();
  }

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
                <button type="button" onClick={() => open(p)} className="flex items-center gap-1.5 rounded-sm type-small text-link focus-visible:focus-ring">
                  {p.photos?.length ? (
                    <>
                      <span className="flex -space-x-2">
                        {p.photos.map((ph) =>
                          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                          ph.url ? <img key={ph.id} src={ph.url} alt="" className="size-8 rounded-sm border-2 border-surface-raised object-cover" loading="lazy" /> : null,
                        )}
                      </span>
                      <span className="sr-only">
                        {p.photos.length} photo{p.photos.length === 1 ? "" : "s"} of {p.name}. Change photos
                      </span>
                    </>
                  ) : (
                    <>
                      <ImagePlus aria-hidden size={14} strokeWidth={1.5} />
                      Add photos
                    </>
                  )}
                </button>
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
        onOpenChange={(o) => !o && !busy && close()}
        title={edit?.id ? `Edit ${edit.name}` : "New product"}
        footer={
          <>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={close}>
              Cancel
            </Button>
            <Button loading={Boolean(busy)} disabled={preparing} onClick={save}>
              {busy ?? "Save"}
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
            <Field label={`Photos (up to ${MAX_PRODUCT_PHOTOS})`} labelAs="legend" hint="Posts about this product show the first photo exactly as it is. Best: the product alone on a plain white or one-colour background (or a PNG without background)." optionalLabel="Optional">
              <div className="grid grid-cols-3 gap-3">
                {edit.photos.map((ph) => (
                  <Thumb key={ph.id} url={ph.url} label="Remove photo" onRemove={() => setEdit({ ...edit, photos: edit.photos.filter((x) => x.id !== ph.id), removed: [...edit.removed, ph.id] })} />
                ))}
                {edit.added.map((a) => (
                  <Thumb
                    key={a.key}
                    url={a.url}
                    label="Remove photo"
                    onRemove={() => {
                      URL.revokeObjectURL(a.url);
                      setEdit({ ...edit, added: edit.added.filter((x) => x.key !== a.key) });
                    }}
                  />
                ))}
                {photoCount < MAX_PRODUCT_PHOTOS ? (
                  <button
                    type="button"
                    disabled={preparing}
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong type-small text-ink-muted hover:border-ink-muted hover:text-ink focus-visible:focus-ring disabled:opacity-60"
                  >
                    <ImagePlus aria-hidden size={20} strokeWidth={1.5} />
                    {preparing ? "Preparing…" : "Add photo"}
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  void pick(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </Field>
            <Switch checked={edit.active} onCheckedChange={(active) => setEdit({ ...edit, active })} label="Promote this product" description="Off = the AI leaves it out of new posts." />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Thumb({ url, label, onRemove }: { url: string | null; label: string; onRemove: () => void }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-md border border-line bg-surface-sunk">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or a local preview */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full border border-line bg-surface-raised/90 text-ink shadow-sm hover:bg-surface-raised focus-visible:focus-ring"
      >
        <X aria-hidden size={14} strokeWidth={2} />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
