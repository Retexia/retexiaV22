"use client";

import { Button, Card, Dialog, EmptyState, Field, Input, cn, formatDate } from "@retexia/ui";
import { Check, Copy, ImageIcon, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteMedia, mediaUsage, updateMediaAlt, type MediaItem } from "@/app/(panel)/website/actions";
import { uploadFile } from "./media-picker";

const kb = (n: number | null) => (n === null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function MediaLibrary({ items }: { items: MediaItem[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState("");
  const [uses, setUses] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setUploading(list.length);
    let ok = 0;
    for (const f of list) {
      const r = await uploadFile(f);
      if (r.ok) ok++;
      else toast.error(`${f.name}: ${r.message}`);
      setUploading((n) => n - 1);
    }
    if (ok) toast.success(`${ok} image${ok === 1 ? "" : "s"} uploaded. Add alt text to each.`);
    router.refresh();
  };

  const show = async (m: MediaItem) => {
    setOpen(m);
    setAlt(m.alt ?? "");
    setUses(null);
    setUses(await mediaUsage({ url: m.url }));
  };

  const shown = items.filter((m) => !q || (m.alt ?? "").toLowerCase().includes(q.toLowerCase()) || m.url.toLowerCase().includes(q.toLowerCase()));
  const noAlt = items.filter((m) => !m.alt).length;

  return (
    <div className="flex flex-col gap-4">
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
        className={cn("flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-hover", dragging ? "border-brand bg-brand-soft/40" : "border-line")}
      >
        <Upload aria-hidden size={24} strokeWidth={1.5} className="text-ink-muted" />
        <p className="type-body text-ink">Drop images here, or</p>
        <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,image/x-icon" className="sr-only" tabIndex={-1} onChange={(e) => (upload(e.target.files ?? []), (e.target.value = ""))} />
        <Button variant="secondary" loading={uploading > 0} onClick={() => fileRef.current?.click()}>
          {uploading > 0 ? `Uploading ${uploading}…` : "Choose files"}
        </Button>
        <p className="type-small text-ink-muted">PNG, JPG, WebP, GIF, AVIF, SVG or ICO · up to 5 MB each</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label="Search media" placeholder="Search alt text or file name" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {noAlt ? <span className="type-small text-warning">{noAlt} image{noAlt === 1 ? "" : "s"} without alt text</span> : null}
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => show(m)} className="flex w-full flex-col gap-1.5 rounded-lg border border-line bg-surface-raised p-2 text-left transition-hover hover:border-brand focus-visible:focus-ring">
                {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs */}
                <img src={m.url} alt={m.alt ?? ""} loading="lazy" className="aspect-square w-full rounded-md bg-surface-sunk object-contain" />
                <span className={cn("truncate type-small", m.alt ? "text-ink" : "text-warning")}>{m.alt || "No alt text"}</span>
                <span className="type-small text-ink-muted">
                  {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
                  {kb(m.size)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={items.length ? "Nothing matches" : "No images yet"} icon={<ImageIcon aria-hidden size={24} strokeWidth={1.5} />}>
          {items.length ? "Try another search." : "Upload logos, product shots and photos here."}
        </EmptyState>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} size="lg" title="Image details">
        {open ? (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs */}
            <img src={open.url} alt={open.alt ?? ""} className="max-h-80 w-full rounded-md bg-surface-sunk object-contain" />
            <div className="flex flex-col gap-4">
              <Field label="Alt text" hint="Describe what the image shows. Leave empty only for decoration.">
                <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
              </Field>
              <Button
                size="sm"
                className="self-start"
                loading={busy}
                disabled={alt === (open.alt ?? "")}
                icon={<Check aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  setBusy(true);
                  const r = await updateMediaAlt({ id: open.id, alt });
                  setBusy(false);
                  toast[r.ok ? "success" : "error"](r.message ?? "");
                  if (r.ok) router.refresh();
                }}
              >
                Save alt text
              </Button>
              <dl className="grid grid-cols-2 gap-2 type-small">
                <dt className="text-ink-muted">Type</dt>
                <dd>{open.mime}</dd>
                <dt className="text-ink-muted">Size</dt>
                <dd>
                  {kb(open.size)}
                  {open.width ? ` · ${open.width}×${open.height}` : ""}
                </dd>
                <dt className="text-ink-muted">Uploaded</dt>
                <dd>{formatDate(open.created_at)}</dd>
              </dl>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                icon={<Copy aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  await navigator.clipboard.writeText(open.url);
                  toast.success("Link copied");
                }}
              >
                Copy link
              </Button>
              <Card className="flex flex-col gap-1 bg-surface-sunk/50!">
                <span className="type-label text-ink">Used in</span>
                {uses === null ? (
                  <span className="type-small text-ink-muted">Checking…</span>
                ) : uses.length ? (
                  <ul className="list-disc pl-5 type-small text-ink">
                    {uses.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="type-small text-ink-muted">Not used anywhere.</span>
                )}
              </Card>
              <Button
                size="sm"
                variant="ghost"
                className="self-start text-danger!"
                disabled={uses === null || uses.length > 0}
                icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  if (!window.confirm("Delete this image for good?")) return;
                  const r = await deleteMedia({ id: open.id });
                  toast[r.ok ? "success" : "error"](r.message ?? "");
                  if (r.ok) {
                    setOpen(null);
                    router.refresh();
                  }
                }}
              >
                Delete image
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
