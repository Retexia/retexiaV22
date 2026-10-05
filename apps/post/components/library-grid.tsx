"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, cn, formatDate } from "@retexia/ui";
import { ImageIcon, ImageOff, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteMedia, updateMedia, uploadMedia } from "@/app/actions";
import { photoForm } from "@/lib/resize";

type Item = { id: string; url: string | null; kind: string; source: string; product_id: string | null; description: string; tags: string[]; last_used_at: string | null; created_at: string };

export function LibraryGrid({ items, products, filter }: { items: Item[]; products: { id: string; name: string }[]; filter: { product: string | null; source: string | null } }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadProduct, setUploadProduct] = useState(filter.product ?? "");
  const [dragging, setDragging] = useState(false);
  const [edit, setEdit] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast.error("Choose photos (JPG, PNG, WebP or HEIC).");
    setUploading(list.length);
    let ok = 0;
    for (const f of list) {
      try {
        const r = await uploadMedia(await photoForm(f, uploadProduct ? { product_id: uploadProduct } : {}));
        if (r.ok) ok++;
        else toast.error(`${f.name}: ${r.message}`);
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "could not upload"}`);
      }
      setUploading((n) => n - 1);
    }
    if (ok) toast.success(`${ok} photo${ok === 1 ? "" : "s"} added`);
    router.refresh();
  };

  const chip = (active: boolean) => cn("inline-flex h-8 items-center rounded-full px-3 type-label", active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk");
  const qs = (p: string | null, s: string | null) => {
    const u = new URLSearchParams();
    if (p) u.set("product", p);
    if (s) u.set("source", s);
    return u.size ? `/library?${u}` : "/library";
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center", dragging ? "border-brand bg-brand-soft/40" : "border-line")}
      >
        <Upload aria-hidden size={24} strokeWidth={1.5} className="text-ink-muted" />
        <p className="type-body text-ink">Drop product photos here, or</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select aria-label="Product for these photos" value={uploadProduct} onChange={(e) => setUploadProduct(e.target.value)} className="h-10 rounded-full border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:focus-ring">
            <option value="">No product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => (upload(e.target.files ?? []), (e.target.value = ""))} />
          <Button variant="secondary" loading={uploading > 0} onClick={() => fileRef.current?.click()}>
            {uploading ? `Uploading ${uploading}…` : "Choose photos"}
          </Button>
        </div>
        <p className="type-small text-ink-muted">Resized to 2048 px and location data removed before upload.</p>
      </div>

      <nav aria-label="Filter" className="flex flex-wrap gap-1">
        <Link href={qs(null, filter.source)} className={chip(!filter.product)}>
          All products
        </Link>
        {products.map((p) => (
          <Link key={p.id} href={qs(p.id, filter.source)} className={chip(filter.product === p.id)}>
            {p.name}
          </Link>
        ))}
        <span className="mx-2 w-px bg-line" aria-hidden />
        <Link href={qs(filter.product, null)} className={chip(!filter.source)}>
          All
        </Link>
        <Link href={qs(filter.product, "upload")} className={chip(filter.source === "upload")}>
          My photos
        </Link>
        <Link href={qs(filter.product, "ai")} className={chip(filter.source === "ai")}>
          AI designs
        </Link>
      </nav>

      {items.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setEdit(m)} className="flex w-full flex-col gap-1.5 rounded-lg border border-line bg-surface-raised p-2 text-left transition-hover hover:border-brand focus-visible:focus-ring">
                <span className="relative block aspect-square overflow-hidden rounded-md bg-surface-sunk">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                  {m.url ? <img src={m.url} alt={m.description} className="size-full object-cover" loading="lazy" /> : <ImageOff aria-hidden size={20} strokeWidth={1.5} className="m-auto mt-[40%] text-ink-muted" />}
                  {m.source === "ai" ? <Badge tone="brand" className="absolute top-1 left-1">AI</Badge> : null}
                </span>
                <span className="truncate type-small text-ink">{products.find((p) => p.id === m.product_id)?.name ?? "No product"}</span>
                <span className="type-caption text-ink-muted">{m.last_used_at ? `Used ${formatDate(m.last_used_at)}` : "Not used yet"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No photos yet" icon={<ImageIcon aria-hidden size={24} strokeWidth={1.5} />}>
          Real photos of your products make the best posts. Add a few for each product.
        </EmptyState>
      )}

      <Dialog
        open={Boolean(edit)}
        onOpenChange={(o) => !o && setEdit(null)}
        size="lg"
        title="Photo"
        footer={
          edit ? (
            <>
              <Button
                variant="ghost"
                className="mr-auto text-danger!"
                icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  if (!window.confirm("Delete this photo?")) return;
                  const r = await deleteMedia({ id: edit.id });
                  toast[r.ok ? "success" : "error"](r.message ?? "");
                  if (r.ok) {
                    setEdit(null);
                    router.refresh();
                  }
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await updateMedia({ id: edit.id, product_id: edit.product_id, description: edit.description, tags: edit.tags });
                  setBusy(false);
                  toast[r.ok ? "success" : "error"](r.message ?? "");
                  if (r.ok) {
                    setEdit(null);
                    router.refresh();
                  }
                }}
              >
                Save
              </Button>
            </>
          ) : null
        }
      >
        {edit ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Card padded={false} className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
              {edit.url ? <img src={edit.url} alt={edit.description} className="w-full object-contain" /> : null}
            </Card>
            <div className="flex flex-col gap-4">
              <Field label="Product">
                <Select value={edit.product_id ?? ""} onChange={(e) => setEdit({ ...edit, product_id: e.target.value || null })} options={products.map((p) => ({ value: p.id, label: p.name }))} placeholder="No product" />
              </Field>
              <Field label="What's in the photo" hint="One line. Helps the AI pick the right photo." optionalLabel="Optional">
                <Input value={edit.description} maxLength={300} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </Field>
              <Field label="Tags" hint="Separated by commas." optionalLabel="Optional">
                <Input value={edit.tags.join(", ")} onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
              </Field>
              <p className="type-small text-ink-muted">
                Added {formatDate(edit.created_at)} · {edit.source === "ai" ? "AI design" : "Your photo"}
              </p>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
