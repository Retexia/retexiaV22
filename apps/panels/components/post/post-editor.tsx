"use client";

import { Alert, Button, Card, Field, Input, Select, Textarea, cn } from "@retexia/ui";
import { Check, ImageOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { editPost, movePost } from "@/app/post/actions";
import type { PostView } from "@/lib/post/posts";

type LibraryItem = { id: string; url: string | null; description: string | null };

export function PostEditor({
  post,
  editable,
  slots,
  days,
  library,
  dropped,
}: {
  post: PostView;
  editable: boolean;
  slots: string[];
  days: { value: string; label: string }[];
  library: LibraryItem[];
  dropped: string[];
}) {
  const router = useRouter();
  const [fb, setFb] = useState(post.facebook);
  const [ig, setIg] = useState(post.instagram);
  const [tags, setTags] = useState(post.hashtags.join(" "));
  const [mediaId, setMediaId] = useState(post.mediaId);
  const [date, setDate] = useState(post.date);
  const [slot, setSlot] = useState(String(post.slot));
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = fb !== post.facebook || ig !== post.instagram || tags !== post.hashtags.join(" ") || mediaId !== post.mediaId;

  if (!editable) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">This post can&apos;t be changed now</h2>
        <p className="type-body text-ink-muted">
          {post.locked && ["ready", "approved"].includes(post.status)
            ? "It is within 15 minutes of its time, so it is being prepared for publishing."
            : "It has already gone out, been skipped, or is still being made."}
        </p>
        {dropped.length ? <DroppedNote dropped={dropped} /> : null}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Captions</h2>
        <Field label="Instagram" hint={`${ig.length}/2200`}>
          <Textarea rows={6} value={ig} maxLength={2200} onChange={(e) => setIg(e.target.value)} />
        </Field>
        <Field label="Hashtags" hint="Separated by spaces, without #. 3 to 8 work best." optionalLabel="Optional">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="colombobakery cakes weekendoffer" />
        </Field>
        <Field label="Facebook">
          <Textarea rows={6} value={fb} maxLength={5000} onChange={(e) => setFb(e.target.value)} />
        </Field>
        {dropped.length ? <DroppedNote dropped={dropped} /> : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="type-h2 text-ink">Picture</h2>
          <Link href="/library" className="type-label text-link">
            Add photos to your library
          </Link>
        </div>
        <p className="type-small text-ink-muted">Keep the designed picture, or use one of your own photos instead.</p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {post.mediaId && !library.some((m) => m.id === post.mediaId) ? (
            <li>
              <PickButton active={mediaId === post.mediaId} onClick={() => setMediaId(post.mediaId)} url={post.imageUrl} label="Current design" />
            </li>
          ) : null}
          {library.map((m) => (
            <li key={m.id}>
              <PickButton active={mediaId === m.id} onClick={() => setMediaId(m.id)} url={m.url} label={m.description ?? "Library photo"} />
            </li>
          ))}
        </ul>
        {!library.length ? <p className="type-small text-ink-muted">Your photo library is empty.</p> : null}
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-full border border-line bg-surface-raised/95 px-4 py-2 shadow-float backdrop-blur">
        <span className="type-small text-ink-muted">{dirty ? "Saving also approves the post" : "No changes"}</span>
        <Button
          size="sm"
          loading={busy === "save"}
          disabled={!dirty}
          icon={<Check aria-hidden size={14} strokeWidth={1.5} />}
          onClick={async () => {
            setBusy("save");
            const r = await editPost({
              id: post.id,
              facebook: fb,
              instagram: ig,
              hashtags: tags.split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean),
              media_id: mediaId,
            });
            setBusy(null);
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (r.ok) router.refresh();
          }}
        >
          Save and approve
        </Button>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Time</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day">
            <Select value={date} onChange={(e) => setDate(e.target.value || post.date)} options={days} />
          </Field>
          <Field label="Time">
            <Select value={slot} onChange={(e) => setSlot(e.target.value || String(post.slot))} options={slots.map((s, i) => ({ value: String(i + 1), label: s }))} />
          </Field>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          loading={busy === "move"}
          disabled={date === post.date && slot === String(post.slot)}
          onClick={async () => {
            setBusy("move");
            const r = await movePost({ id: post.id, date, slot: Number(slot) });
            setBusy(null);
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (r.ok) router.refresh();
          }}
        >
          Move post
        </Button>
      </Card>
    </div>
  );
}

function PickButton({ active, onClick, url, label }: { active: boolean; onClick: () => void; url: string | null; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn("relative block aspect-square w-full overflow-hidden rounded-md border-2 bg-surface-sunk focus-visible:focus-ring", active ? "border-brand" : "border-transparent hover:border-line-strong")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
      {url ? <img src={url} alt={label} className="size-full object-cover" loading="lazy" /> : <ImageOff aria-hidden size={18} strokeWidth={1.5} className="m-auto text-ink-muted" />}
      {active ? <Check aria-hidden size={18} strokeWidth={2} className="absolute top-1 right-1 rounded-full bg-brand p-0.5 text-on-brand" /> : null}
    </button>
  );
}

function DroppedNote({ dropped }: { dropped: string[] }) {
  return (
    <Alert tone="info" title="Left off the picture on purpose">
      These lines had numbers we couldn&apos;t find in your products or request, so they were not put on the design: {dropped.join("; ")}.
    </Alert>
  );
}
