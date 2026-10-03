"use client";

import { Button, Dialog, Input } from "@retexia/ui";
import { ImageIcon, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listMedia, uploadMedia, type MediaItem } from "@/app/(panel)/website/actions";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,image/x-icon";

/** Read an image's size in the browser (sent along so the website can reserve space). */
export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function uploadFile(file: File, alt = "") {
  const size = await imageSize(file);
  const fd = new FormData();
  fd.set("file", file);
  fd.set("alt", alt);
  if (size) {
    fd.set("width", String(size.width));
    fd.set("height", String(size.height));
  }
  return uploadMedia(fd);
}

/** Picks an image from the media library (or uploads one). */
export function MediaPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (m: { url: string; alt: string | null }) => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = window.setTimeout(async () => {
      const r = await listMedia({ q });
      if (active) setItems(r);
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [open, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Media library" description="Pick an image or upload a new one (PNG, JPG, WebP, GIF, AVIF, SVG; up to 5 MB).">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input aria-label="Search media" placeholder="Search by name or alt text" value={q} onChange={(e) => setQ(e.target.value)} />
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              const r = await uploadFile(file);
              setBusy(false);
              if (!r.ok || !r.data) return toast.error(r.ok ? "Upload failed" : r.message);
              toast.success("Uploaded");
              onPick({ url: r.data.url, alt: null });
              onOpenChange(false);
            }}
          />
          <Button variant="secondary" loading={busy} icon={<Upload aria-hidden size={16} strokeWidth={1.5} />} onClick={() => fileRef.current?.click()}>
            Upload
          </Button>
        </div>
        {items === null ? (
          <p className="type-body text-ink-muted">Loading…</p>
        ) : items.length ? (
          <ul className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ url: m.url, alt: m.alt });
                    onOpenChange(false);
                  }}
                  className="flex w-full flex-col gap-1 rounded-md border border-line p-1.5 text-left transition-hover hover:border-brand focus-visible:focus-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails, any host */}
                  <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full rounded-sm bg-surface-sunk object-contain" loading="lazy" />
                  <span className="truncate type-small text-ink-muted">{m.alt || m.url.split("/").pop()}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body text-ink-muted">No images yet. Upload the first one.</p>
        )}
      </div>
    </Dialog>
  );
}

/** URL input with a thumbnail and a "Library" button. */
export function MediaInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-sunk">
        {/* eslint-disable-next-line @next/next/no-img-element -- preview of any URL */}
        {value ? <img src={value} alt="" className="size-full object-contain" /> : <ImageIcon aria-hidden size={16} strokeWidth={1.5} className="text-ink-muted" />}
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or choose from the library" />
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Library
      </Button>
      <MediaPicker open={open} onOpenChange={setOpen} onPick={(m) => onChange(m.url)} />
    </div>
  );
}
