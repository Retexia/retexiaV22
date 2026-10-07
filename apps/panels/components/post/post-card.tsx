"use client";

import { Badge, Button, Card, Dialog, RadioCards, StatusBadge, cn } from "@retexia/ui";
import { Check, Copy, Download, ExternalLink, ImageOff, Lock, Pencil, RotateCcw, SkipForward, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { approvePost, denyPost, retryPost, skipPost } from "@/app/post/actions";
import { DENY_REASONS } from "@/lib/post/options";
import type { PostView } from "@/lib/post/posts";
import { FORMAT_LABEL, STATUS } from "@/lib/post/status";

export function PostCard({ post, autoPublish, compact = false }: { post: PostView; autoPublish: boolean; compact?: boolean }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<"instagram" | "facebook">("instagram");
  const [denyOpen, setDenyOpen] = useState(false);
  const [reason, setReason] = useState("both");
  const [busy, setBusy] = useState<string | null>(null);
  const s = STATUS[post.status];
  const caption = platform === "instagram" ? post.instagram + (post.hashtags.length ? `\n\n${post.hashtags.map((t) => `#${t}`).join(" ")}` : "") : post.facebook;
  const canAct = !post.locked && ["ready", "approved"].includes(post.status);

  const act = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
  };

  const hint =
    post.status === "ready"
      ? autoPublish
        ? `Goes out at ${post.time} unless you change it`
        : `Approve before ${post.time} or it is skipped`
      : post.status === "approved"
        ? `Goes out at ${post.time}`
        : post.status === "needs_manual"
          ? "No new versions left: edit it, pick your own photo, or skip it"
          : post.status === "failed"
            ? "Couldn't publish. Retry, or post it yourself"
            : null;

  return (
    <Card padded={false} className={cn("flex flex-col overflow-hidden", post.status === "needs_manual" || post.status === "failed" ? "ring-1 ring-danger/40" : "")}>
      <div className="relative bg-surface-sunk">
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={post.imageUrl} alt="" className={cn("w-full object-cover", post.isStory ? "aspect-[9/16] max-h-80" : "aspect-[4/5]")} loading="lazy" />
        ) : (
          <div className={cn("flex w-full items-center justify-center text-ink-muted", post.isStory ? "aspect-[9/16] max-h-80" : "aspect-[4/5]")}>
            {["generating", "denied", "safety_review"].includes(post.status) ? <span className="animate-pulse type-small">Making your post…</span> : <ImageOff aria-hidden size={28} strokeWidth={1.5} />}
          </div>
        )}
        <span className="absolute top-2 left-2 flex gap-1.5">
          <Badge tone="neutral" className="bg-surface-raised/90!">
            {post.time} · {FORMAT_LABEL[post.format] ?? post.format}
          </Badge>
          {post.locked && ["ready", "approved"].includes(post.status) ? (
            <Badge tone="neutral" className="bg-surface-raised/90!">
              <Lock aria-hidden size={12} strokeWidth={1.5} /> Locked
            </Badge>
          ) : null}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge tone={s.tone} label={s.label} />
          {post.regenLeft < 10 ? <span className="type-caption text-ink-muted">{post.regenLeft} of 10 new versions left</span> : null}
        </div>
        {hint ? <p className="type-small text-ink-muted">{hint}</p> : null}
        {post.facebook || post.instagram ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1" role="tablist" aria-label="Caption for">
              {(["instagram", "facebook"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={platform === p}
                  onClick={() => setPlatform(p)}
                  className={cn("h-7 rounded-full px-3 type-caption", platform === p ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}
                >
                  {p === "instagram" ? "Instagram" : "Facebook"}
                </button>
              ))}
            </div>
            <p className={cn("type-small whitespace-pre-line text-ink", compact && "line-clamp-4")}>{caption}</p>
          </div>
        ) : null}
        {post.publications.length ? (
          <ul className="flex flex-col gap-1">
            {post.publications.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 type-small">
                <span className="capitalize text-ink">{p.name ?? p.platform}</span>
                {p.status === "published" ? (
                  p.permalink ? (
                    <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link">
                      View <ExternalLink aria-hidden size={12} strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span className="text-success">Published</span>
                  )
                ) : (
                  <span className={p.status === "failed" ? "text-danger" : "text-ink-muted"} title={p.error ?? undefined}>
                    {p.status === "failed" ? "Failed" : p.status === "retrying" ? "Retrying" : "Waiting"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {post.status === "ready" && !post.locked ? (
            <Button size="sm" loading={busy === "approve"} icon={<Check aria-hidden size={14} strokeWidth={1.5} />} onClick={() => act("approve", () => approvePost({ id: post.id }))}>
              Approve
            </Button>
          ) : null}
          {["ready", "approved", "needs_manual", "denied", "blocked"].includes(post.status) && !post.locked ? (
            <Button size="sm" variant="secondary" href={`/posts/${post.id}`} icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />}>
              Edit
            </Button>
          ) : (
            <Button size="sm" variant="ghost" href={`/posts/${post.id}`}>
              Details
            </Button>
          )}
          {canAct ? (
            <Button size="sm" variant="ghost" icon={<ThumbsDown aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDenyOpen(true)}>
              New version
            </Button>
          ) : null}
          {post.status === "failed" ? (
            <Button size="sm" loading={busy === "retry"} icon={<RotateCcw aria-hidden size={14} strokeWidth={1.5} />} onClick={() => act("retry", () => retryPost({ id: post.id }))}>
              Retry now
            </Button>
          ) : null}
          {["needs_manual", "blocked", "ready", "approved"].includes(post.status) && !post.locked ? (
            <Button size="sm" variant="ghost" loading={busy === "skip"} icon={<SkipForward aria-hidden size={14} strokeWidth={1.5} />} onClick={() => window.confirm("Skip this post? Nothing goes out in this slot.") && act("skip", () => skipPost({ id: post.id }))}>
              Skip
            </Button>
          ) : null}
          {post.status === "failed" || post.status === "expired" ? (
            <>
              {post.imageUrl ? (
                <Button size="sm" variant="ghost" href={post.imageUrl} target="_blank" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
                  Picture
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon={<Copy aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  await navigator.clipboard.writeText(caption);
                  toast.success("Caption copied");
                }}
              >
                Copy caption
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog
        open={denyOpen}
        onOpenChange={setDenyOpen}
        title="What should change?"
        description={`We make a new version of just that part. ${post.regenLeft} of 10 new versions left for this post.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDenyOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy === "deny"}
              onClick={async () => {
                await act("deny", () => denyPost({ id: post.id, reason: reason as "caption" | "image" | "both" | "wrong_product" }));
                setDenyOpen(false);
              }}
            >
              Make a new version
            </Button>
          </>
        }
      >
        <RadioCards name={`deny-${post.id}`} options={DENY_REASONS} value={reason} onChange={setReason} columns={2} compact />
        <p className="mt-3 type-small text-ink-muted">
          Prefer to fix it yourself?{" "}
          <Link href={`/posts/${post.id}`} className="text-link">
            Edit the caption or pick a photo
          </Link>
          .
        </p>
      </Dialog>
    </Card>
  );
}
